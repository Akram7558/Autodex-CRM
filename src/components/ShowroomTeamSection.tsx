'use client'
// ─────────────────────────────────────────────────────────────────────
// ShowroomTeamSection
// ─────────────────────────────────────────────────────────────────────
// Two sections embedded on /dashboard/parametres for owner/manager:
//
//   1. "Mon Équipe" — list / create / edit / delete teammates
//      (manager / closer / prospecteur) for the caller's showroom.
//      Owner can edit; manager can only delete teammates they created.
//
//   2. "Distribution automatique des leads" — round-robin rotation
//      driven by `showroom_lead_distribution`. Toggle members on/off,
//      add a non-rotating teammate, remove from rotation. Save runs a
//      single PUT that upserts every entry; remove is a one-shot
//      DELETE.
//
// Both panels are owner+manager-only. The parent page chooses whether
// to render this component at all; closer/prospecteur should never
// reach /dashboard/parametres in the first place (ACL).
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Users, UserPlus, Pencil, Trash2, X, CheckCircle2, Shuffle, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────

type ShowroomRole = 'manager' | 'closer' | 'prospecteur'

type Employee = {
  id:          string
  user_id:     string
  email:       string | null
  full_name:   string | null
  phone:       string | null
  role:        ShowroomRole
  created_by:  string | null
  created_at:  string
}

type DistEntry = {
  user_id:          string
  email:            string | null
  full_name:        string | null
  role:             ShowroomRole | null
  role_label:       string | null
  active:           boolean
  last_assigned_at: string | null
}

type Available = {
  user_id:    string
  email:      string | null
  full_name:  string | null
  role:       ShowroomRole
  role_label: string
}

const ROLE_LABEL: Record<ShowroomRole, string> = {
  manager:     'Manager',
  closer:      'Closer',
  prospecteur: 'Prospecteur',
}
const ROLE_BADGE: Record<ShowroomRole, string> = {
  manager:     'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border-violet-200/60 dark:border-violet-500/30',
  closer:      'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200/60 dark:border-blue-500/30',
  prospecteur: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
}

// ── Component ──────────────────────────────────────────────────────

export default function ShowroomTeamSection({
  callerRole, callerUserId,
}: {
  callerRole: 'owner' | 'manager' | 'super_admin'
  callerUserId: string | null
}) {
  const [team, setTeam]     = useState<Employee[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamError, setTeamError]     = useState('')

  const [dist, setDist]     = useState<DistEntry[]>([])
  const [available, setAvailable] = useState<Available[]>([])
  const [distLoading, setDistLoading] = useState(true)
  const [distError, setDistError]     = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing]       = useState<Employee | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null)
  const [deletingBusy, setDeletingBusy]   = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2500) }

  async function loadTeam() {
    setTeamLoading(true); setTeamError('')
    const res = await fetch('/api/employees')
    const json = await res.json().catch(() => ({}))
    setTeamLoading(false)
    if (!res.ok) { setTeamError(json?.error ?? 'Erreur de chargement.'); return }
    setTeam((json.employees ?? []) as Employee[])
  }

  async function loadDist() {
    setDistLoading(true); setDistError('')
    const res = await fetch('/api/showroom/lead-distribution')
    const json = await res.json().catch(() => ({}))
    setDistLoading(false)
    if (!res.ok) { setDistError(json?.error ?? 'Erreur de chargement.'); return }
    setDist((json.entries ?? []) as DistEntry[])
    setAvailable((json.available ?? []) as Available[])
  }

  useEffect(() => { loadTeam(); loadDist() }, [])

  const canEdit = callerRole === 'owner' || callerRole === 'super_admin'
  const allowedCreatableRoles: ShowroomRole[] = canEdit
    ? ['manager', 'closer', 'prospecteur']
    : ['closer', 'prospecteur']

  function canDelete(emp: Employee): boolean {
    if (emp.user_id === callerUserId) return false
    if (canEdit) return true
    // manager: only own creations
    return emp.created_by === callerUserId
  }

  async function saveDist() {
    const res = await fetch('/api/showroom/lead-distribution', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        entries: dist.map((d) => ({ user_id: d.user_id, active: d.active })),
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash(j?.error ?? 'Erreur de mise à jour.')
      return
    }
    flash('Distribution mise à jour')
    loadDist()
  }

  async function toggleDist(user_id: string) {
    setDist((cur) =>
      cur.map((d) => d.user_id === user_id ? { ...d, active: !d.active } : d),
    )
  }

  async function addToDist(user: Available) {
    // Optimistic: insert active by default.
    setAvailable((cur) => cur.filter((a) => a.user_id !== user.user_id))
    setDist((cur) => [
      ...cur,
      {
        user_id:    user.user_id,
        email:      user.email,
        full_name:  user.full_name,
        role:       user.role,
        role_label: user.role_label,
        active:     true,
        last_assigned_at: null,
      },
    ])
  }

  async function removeFromDist(user_id: string) {
    const res = await fetch(`/api/showroom/lead-distribution/${encodeURIComponent(user_id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash(j?.error ?? 'Erreur de suppression.')
      return
    }
    flash('Membre retiré de la rotation')
    loadDist()
  }

  return (
    <div className="space-y-6">
      {/* ── Section: Mon Équipe ─────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[1.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-violet-600 dark:text-violet-400 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Mon Équipe</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Gérez les membres de votre showroom.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Nouvel employé
          </button>
        </div>

        {teamError && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {teamError}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Nom</th>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Email</th>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Rôle</th>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Créé le</th>
                <th className="px-4 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {teamLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">Chargement…</td></tr>
              ) : team.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Aucun employé pour le moment. Cliquez sur « Nouvel employé » pour commencer.
                </td></tr>
              ) : team.map((e) => (
                <tr key={e.user_id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                  <td className="px-4 py-3 text-sm font-bold text-zinc-900 dark:text-white">
                    {e.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 truncate max-w-[200px]" title={e.email ?? ''}>
                    {e.email ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border',
                      ROLE_BADGE[e.role],
                    )}>
                      {ROLE_LABEL[e.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {format(new Date(e.created_at), 'd MMM yyyy', { locale: fr })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          type="button"
                          title="Modifier"
                          onClick={() => setEditing(e)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete(e) && (
                        <button
                          type="button"
                          title="Supprimer"
                          onClick={() => setConfirmDelete(e)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* ── Section: Distribution ────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-[1.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <Shuffle className="w-5 h-5 text-violet-600 dark:text-violet-400 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Distribution automatique des leads</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Activez la distribution round-robin pour assigner automatiquement les nouveaux leads à vos employés.
            </p>
          </div>
        </div>

        {distError && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {distError}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Nom</th>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Email</th>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Rôle</th>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Actif</th>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Dernier lead</th>
                <th className="px-4 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {distLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">Chargement…</td></tr>
              ) : dist.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Aucun membre dans la rotation. Ajoutez un membre ci-dessous.
                </td></tr>
              ) : dist.map((d) => (
                <tr key={d.user_id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                  <td className="px-4 py-3 text-sm font-bold text-zinc-900 dark:text-white">{d.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 truncate max-w-[200px]" title={d.email ?? ''}>{d.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    {d.role ? (
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border',
                        ROLE_BADGE[d.role],
                      )}>
                        {ROLE_LABEL[d.role]}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={d.active}
                      onClick={() => toggleDist(d.user_id)}
                      className={cn(
                        'relative w-10 h-5 rounded-full transition-colors',
                        d.active ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700',
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        d.active && 'translate-x-5',
                      )} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {d.last_assigned_at
                      ? format(new Date(d.last_assigned_at), "d MMM yyyy 'à' HH:mm", { locale: fr })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title="Retirer de la rotation"
                      onClick={() => removeFromDist(d.user_id)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add picker + Save row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AddToDistribution available={available} onAdd={addToDist} />
          <button
            type="button"
            onClick={saveDist}
            disabled={distLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-sm disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" /> Enregistrer
          </button>
        </div>

        <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-3 py-2.5 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Les nouveaux leads seront attribués en rotation aux membres actifs.
            L&apos;attribution suit un ordre équitable (round-robin).
          </p>
        </div>
      </motion.section>

      {createOpen && (
        <CreateEmployeeModal
          allowedRoles={allowedCreatableRoles}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            flash('Employé créé avec succès')
            loadTeam(); loadDist()
          }}
        />
      )}

      {editing && (
        <EditEmployeeModal
          employee={editing}
          allowedRoles={allowedCreatableRoles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            flash('Employé mis à jour')
            loadTeam()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          name={confirmDelete.full_name ?? confirmDelete.email ?? 'cet employé'}
          busy={deletingBusy}
          onCancel={() => { if (!deletingBusy) setConfirmDelete(null) }}
          onConfirm={async () => {
            setDeletingBusy(true)
            const res = await fetch(
              `/api/employees/${encodeURIComponent(confirmDelete.user_id)}`,
              { method: 'DELETE' },
            )
            setDeletingBusy(false)
            if (!res.ok) {
              const j = await res.json().catch(() => ({}))
              flash(j?.error ?? 'Erreur lors de la suppression.')
              return
            }
            setConfirmDelete(null)
            flash('Employé supprimé')
            loadTeam(); loadDist()
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Add picker (dropdown of teammates not yet in rotation) ────────

function AddToDistribution({
  available, onAdd,
}: {
  available: Available[]
  onAdd: (a: Available) => void
}) {
  const [picked, setPicked] = useState<string>('')
  const map = useMemo(() => new Map(available.map((a) => [a.user_id, a])), [available])

  if (available.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Tous les membres de l&apos;équipe sont déjà dans la rotation.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
        className="h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
      >
        <option value="">— Ajouter un membre —</option>
        {available.map((a) => (
          <option key={a.user_id} value={a.user_id}>
            {a.full_name ?? a.email ?? a.user_id} · {a.role_label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!picked}
        onClick={() => {
          const a = map.get(picked)
          if (a) onAdd(a)
          setPicked('')
        }}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 disabled:opacity-50"
      >
        <UserPlus className="w-3.5 h-3.5" /> Ajouter
      </button>
    </div>
  )
}

// ── Create modal ──────────────────────────────────────────────────

function CreateEmployeeModal({
  allowedRoles, onClose, onCreated,
}: {
  allowedRoles: ShowroomRole[]
  onClose: () => void
  onCreated: () => void
}) {
  const [full_name, setFullName] = useState('')
  const [email, setEmail]        = useState('')
  const [phone, setPhone]        = useState('')
  const [pw, setPw]              = useState('')
  const [pw2, setPw2]            = useState('')
  const [role, setRole]          = useState<ShowroomRole>(allowedRoles[0] ?? 'closer')
  const [saving, setSaving]      = useState(false)
  const [error, setError]        = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!full_name.trim()) { setError('Nom complet requis.'); return }
    if (!email.trim())     { setError('Email requis.'); return }
    if (pw.length < 8)     { setError('Mot de passe : 8 caractères minimum.'); return }
    if (pw !== pw2)        { setError('Les mots de passe ne correspondent pas.'); return }
    setSaving(true)
    const res = await fetch('/api/employees/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        full_name: full_name.trim(),
        email:     email.trim(),
        password:  pw,
        phone:     phone.trim() || undefined,
        role,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j?.error ?? 'Erreur lors de la création.'); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">Ajouter un employé</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <Field label="Nom complet *">
            <input
              value={full_name}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="ex. Karim Bensalem"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </Field>
          <Field label="Email *">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="exemple@autodex.store"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </Field>
          <Field label="Téléphone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+213 5 XX XX XX XX"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mot de passe *">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="8 caractères min."
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
              />
              {pw.length > 0 && pw.length < 8 && (
                <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">{pw.length}/8 caractères</p>
              )}
            </Field>
            <Field label="Confirmer *">
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Confirmer le mot de passe"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
              />
              {pw2.length > 0 && pw !== pw2 && (
                <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">Les mots de passe diffèrent.</p>
              )}
            </Field>
          </div>
          <Field label="Rôle *">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ShowroomRole)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            >
              {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>

          {error && <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-700 text-white font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {saving ? 'Création…' : (<><UserPlus className="w-4 h-4" /> Créer</>)}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ── Edit modal (owner only) ───────────────────────────────────────

function EditEmployeeModal({
  employee, allowedRoles, onClose, onSaved,
}: {
  employee: Employee
  allowedRoles: ShowroomRole[]
  onClose: () => void
  onSaved: () => void
}) {
  const [email, setEmail] = useState(employee.email ?? '')
  const [pw, setPw]       = useState('')
  const [role, setRole]   = useState<ShowroomRole>(employee.role)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pw && pw.length < 8) { setError('Mot de passe : 8 caractères minimum.'); return }
    setSaving(true)
    const body: Record<string, unknown> = {}
    if (email && email !== employee.email) body.email = email
    if (pw)                                 body.password = pw
    if (role !== employee.role)             body.role = role
    if (Object.keys(body).length === 0) {
      setSaving(false)
      onClose()
      return
    }
    const res = await fetch(`/api/employees/${encodeURIComponent(employee.user_id)}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j?.error ?? 'Erreur lors de la sauvegarde.'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col"
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-foreground">Modifier l&apos;employé</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{employee.full_name ?? employee.email}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </Field>
          <Field label="Nouveau mot de passe (optionnel)">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Laisser vide pour conserver"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
          </Field>
          <Field label="Rôle">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ShowroomRole)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            >
              {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>

          {error && <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-700 text-white font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {saving ? 'Enregistrement…' : (<><CheckCircle2 className="w-4 h-4" /> Enregistrer</>)}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ── Confirm delete ────────────────────────────────────────────────

function ConfirmDeleteDialog({
  name, busy, onCancel, onConfirm,
}: {
  name: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-sm p-6"
      >
        <h3 className="text-base font-semibold text-foreground">Supprimer cet employé ?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> sera définitivement supprimé.
          Cette action est irréversible.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {busy ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}
