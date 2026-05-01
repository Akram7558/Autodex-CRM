'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Pencil, Trash2, X, Users as UsersIcon, CheckCircle2, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { AppRole, AppUser, Showroom, UserRole } from '@/lib/types'

// Roles selectable from the super-admin form. closer / prospecteur are
// managed by showroom owners in their own settings page (Phase 2).
const ROLE_VALUES: AppRole[] = ['super_admin', 'commercial', 'prospecteur_saas', 'owner', 'manager']

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin:      'Super Admin',
  commercial:       'Commercial',
  prospecteur_saas: 'Prospecteur SaaS',
  owner:            'Propriétaire',
  manager:          'Manager',
  closer:           'Closer',
  prospecteur:     'Prospecteur',
}

const ROLE_BADGE: Record<AppRole, string> = {
  super_admin:      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  commercial:       'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30',
  prospecteur_saas: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/30',
  owner:            'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30',
  manager:          'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
  closer:           'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  prospecteur:      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
}

const INTERNAL_ROLES: AppRole[] = ['super_admin', 'commercial', 'prospecteur_saas']
function isInternal(role: AppRole): boolean {
  return INTERNAL_ROLES.includes(role)
}

type Form = {
  id: string | null         // user_roles.id when editing
  email: string
  name: string              // only used for new internal-team accounts
  password: string
  password_confirm: string
  showroom_id: string
  role: AppRole
}

const empty: Form = {
  id: null,
  email: '',
  name: '',
  password: '',
  password_confirm: '',
  showroom_id: '',
  role: 'commercial',
}

export function UsersManager() {
  const [roles, setRoles] = useState<UserRole[]>([])
  const [showrooms, setShowrooms] = useState<Showroom[]>([])
  const [usersById, setUsersById] = useState<Record<string, AppUser>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Success modal — shown after creating an internal-team user.
  const [created, setCreated] = useState<
    | { email: string; emailSent: true }
    | { email: string; emailSent: false; password: string; emailError?: string }
    | null
  >(null)
  const [copied, setCopied] = useState(false)

  async function fetchAll() {
    const [{ data: r }, { data: s }, { data: u }] = await Promise.all([
      supabase.from('user_roles').select('*').order('created_at', { ascending: false }),
      supabase.from('showrooms').select('*').order('name'),
      supabase.from('users').select('id, email, full_name'),
    ])
    setRoles((r ?? []) as UserRole[])
    setShowrooms((s ?? []) as Showroom[])
    const map: Record<string, AppUser> = {}
    for (const x of (u ?? []) as AppUser[]) map[x.id] = x
    setUsersById(map)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const showroomById = useMemo(() => {
    const m: Record<string, Showroom> = {}
    for (const s of showrooms) m[s.id] = s
    return m
  }, [showrooms])

  // ── Submit ─────────────────────────────────────────────────────────
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return

    // Edit flow.
    if (form.id) {
      setSaving(true); setError('')
      // Internal roles must drop showroom_id; tenant roles must keep it.
      const showroomId = isInternal(form.role) ? null : (form.showroom_id || null)
      if (!isInternal(form.role) && !showroomId) {
        setSaving(false); setError('Sélectionnez un showroom pour ce rôle.'); return
      }
      const { error: err } = await supabase
        .from('user_roles')
        .update({ role: form.role, showroom_id: showroomId })
        .eq('id', form.id)
      setSaving(false)
      if (err) { setError(err.message); return }
      setForm(null); fetchAll(); return
    }

    // Create flows (no form.id).
    if (form.role === 'owner') {
      setError('Pour créer un propriétaire, utilisez la page Showrooms → Nouveau showroom.')
      return
    }

    setSaving(true); setError('')

    if (isInternal(form.role)) {
      // ── Internal team: provision via API (creates auth user + role row).
      if (!form.email.trim()) { setSaving(false); setError('Email requis.'); return }
      if (form.password.length < 8) {
        setSaving(false); setError('Le mot de passe doit contenir au moins 8 caractères.'); return
      }
      if (form.password !== form.password_confirm) {
        setSaving(false); setError('Les deux mots de passe ne correspondent pas.'); return
      }
      const res = await fetch('/api/admin/create-internal-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    form.email.trim().toLowerCase(),
          name:     form.name.trim(),
          password: form.password,
          role:     form.role,
        }),
      })
      const json = await res.json().catch(() => ({}))
      setSaving(false)
      if (!res.ok) { setError(json?.error ?? 'Erreur lors de la création.'); return }
      setForm(null)
      if (json.email_sent) {
        setCreated({ email: json.email, emailSent: true })
      } else {
        setCreated({
          email:      json.email,
          emailSent:  false,
          password:   json.temp_password ?? form.password,
          emailError: json.email_error,
        })
      }
      fetchAll()
      return
    }

    // ── Tenant role (manager): existing email-lookup + insert flow ──
    if (!form.email.trim())   { setSaving(false); setError('Email requis.'); return }
    if (!form.showroom_id)    { setSaving(false); setError('Sélectionnez un showroom.'); return }

    const { data: lookup, error: luErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', form.email.trim().toLowerCase())
      .maybeSingle()
    if (luErr) { setSaving(false); setError(luErr.message); return }
    if (!lookup) {
      setSaving(false)
      setError("Aucun utilisateur trouvé avec cet email. L'utilisateur doit d'abord créer un compte.")
      return
    }

    const { error: err } = await supabase.from('user_roles').insert([{
      user_id:     lookup.id,
      showroom_id: form.showroom_id,
      role:        form.role,
    }])
    setSaving(false)
    if (err) {
      if (/uq_user_roles_user/i.test(err.message)) {
        setError('Cet utilisateur a déjà un rôle. Modifiez la ligne existante.')
      } else {
        setError(err.message)
      }
      return
    }
    setForm(null); fetchAll()
  }

  async function remove(r: UserRole) {
    const u = usersById[r.user_id]
    if (!confirm(`Retirer le rôle de ${u?.email ?? 'cet utilisateur'} ?`)) return
    const { error } = await supabase.from('user_roles').delete().eq('id', r.id)
    if (error) { alert(error.message); return }
    fetchAll()
  }

  async function copyCredentials() {
    if (!created || created.emailSent) return
    const text = `Email : ${created.email}\nMot de passe : ${created.password}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copiez ces identifiants :', text)
    }
  }

  // Reactive flags inside the modal.
  const formIsInternal = form ? isInternal(form.role) : false
  const formIsOwner    = form?.role === 'owner'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="rounded-[2rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <UsersIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-white">
            Utilisateurs
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {roles.length}
          </span>
        </div>
        <button
          onClick={() => setForm(empty)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvel utilisateur
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Email</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Showroom</th>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Rôle</th>
              <th className="px-6 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {roles.map((r) => {
              const u = usersById[r.user_id]
              const s = r.showroom_id ? showroomById[r.showroom_id] : null
              return (
                <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-zinc-900 dark:text-white">{u?.email ?? '—'}</div>
                    {u?.full_name && (
                      <div className="text-xs text-zinc-500 mt-0.5">{u.full_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">
                    {s?.name ?? <span className="text-zinc-400 italic">— interne —</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${ROLE_BADGE[r.role]}`}>
                      {ROLE_LABELS[r.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setForm({
                          id: r.id,
                          email: u?.email ?? '',
                          name: u?.full_name ?? '',
                          password: '',
                          password_confirm: '',
                          showroom_id: r.showroom_id ?? '',
                          role: r.role,
                        })}
                        title="Modifier"
                        className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(r)}
                        title="Retirer le rôle"
                        className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && roles.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            Aucun utilisateur. Cliquez sur « Nouvel utilisateur » pour assigner un rôle.
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">
                {form.id ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}
              </h3>
              <button onClick={() => setForm(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              {/* Role selector — drives which fields are visible below */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Rôle *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                >
                  {ROLE_VALUES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {/* Owner: redirect message — no form fields */}
              {!form.id && formIsOwner && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-3">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Pour créer un propriétaire, utilisez la page <strong>Showrooms → Nouveau showroom</strong>.
                    Cette action crée le compte propriétaire et son showroom en une seule étape.
                  </p>
                </div>
              )}

              {/* Email — always visible (read-only on edit) */}
              {!formIsOwner && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={!!form.id}
                    placeholder="utilisateur@autodex.store"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                  />
                  {!form.id && !formIsInternal && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      L&apos;utilisateur doit avoir déjà créé un compte sur AutoDex.
                    </p>
                  )}
                </div>
              )}

              {/* Internal team (creating only): name + password */}
              {!form.id && formIsInternal && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Nom complet</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Prénom Nom"
                      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Mot de passe *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="8 caractères minimum"
                      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Confirmer le mot de passe *</label>
                    <input
                      type="password"
                      value={form.password_confirm}
                      onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                      minLength={8}
                      autoComplete="new-password"
                      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/10 px-3 py-2.5">
                    <p className="text-[11px] text-violet-800 dark:text-violet-300">
                      Compte d&apos;équipe interne — non rattaché à un showroom. Un email de bienvenue sera envoyé.
                    </p>
                  </div>
                </>
              )}

              {/* Showroom (tenant roles only) */}
              {!formIsOwner && !formIsInternal && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Showroom *</label>
                  <select
                    value={form.showroom_id}
                    onChange={(e) => setForm({ ...form, showroom_id: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">— Sélectionner —</option>
                    {showrooms.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted"
                >
                  Annuler
                </button>
                {!(!form.id && formIsOwner) && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 font-medium"
                  >
                    {saving ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Créer'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Success modal (internal-team creation) ───────────────── */}
      {created && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-semibold text-foreground">Utilisateur créé</h3>
              </div>
              <button
                onClick={() => { setCreated(null); setCopied(false) }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {created.emailSent ? (
              <div className="px-6 py-6 space-y-4">
                <p className="text-sm text-foreground">
                  Un email avec les identifiants a été envoyé à{' '}
                  <span className="font-bold break-all">{created.email}</span>.
                </p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => { setCreated(null); setCopied(false) }}
                    className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    ⚠️ Compte créé mais l&apos;email n&apos;a pas pu être envoyé.
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">
                    Identifiants à transmettre manuellement :
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email</p>
                  <p className="text-sm font-mono text-foreground bg-muted rounded-lg px-3 py-2 break-all select-all">{created.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mot de passe</p>
                  <p className="text-sm font-mono text-foreground bg-muted rounded-lg px-3 py-2 break-all select-all">{created.password}</p>
                </div>
                <button
                  type="button"
                  onClick={copyCredentials}
                  className={cn(
                    'flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm font-medium transition-colors',
                    copied ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white',
                  )}
                >
                  {copied ? (<><CheckCircle2 className="w-4 h-4" /> Copié</>) : (<><Copy className="w-4 h-4" /> Copier les identifiants</>)}
                </button>
                {created.emailError && (
                  <p className="text-[10px] text-muted-foreground break-all">Détail : {created.emailError}</p>
                )}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => { setCreated(null); setCopied(false) }}
                    className="px-5 py-2 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
