'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Plus, Search, Pencil, Trash2, X, CalendarClock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  type SaasRdv, type SaasRdvStatus, type SaasProspect,
  SAAS_RDV_STATUS_VALUES, SAAS_RDV_STATUS_LABELS, SAAS_RDV_STATUS_BADGE,
  type AppRole,
} from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const PAGE_SIZE_OPTIONS = [15, 30, 50, 80, 150] as const
type PageSize = typeof PAGE_SIZE_OPTIONS[number]

type RdvWithProspect = SaasRdv & {
  prospect: Pick<SaasProspect, 'id' | 'full_name' | 'phone' | 'showroom_name' | 'suivi'> | null
}

type RdvForm = {
  id: string | null
  prospect_id: string
  scheduled_at: string
  status: SaasRdvStatus
  notes: string
}

const empty: RdvForm = {
  id: null,
  prospect_id: '',
  scheduled_at: '',
  status: 'planifie',
  notes: '',
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SuperAdminRendezVousSaasPage() {
  const [rows, setRows]   = useState<RdvWithProspect[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | SaasRdvStatus>('all')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(15)

  const [form, setForm]   = useState<RdvForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Prospect picker for the create modal — pulled from /api/saas-prospects.
  const [prospectQuery, setProspectQuery] = useState('')
  const [prospectOptions, setProspectOptions] = useState<SaasProspect[]>([])

  const [currentRole, setCurrentRole] = useState<AppRole | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  function flashToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return
      const { data: roleRow } = await supabase
        .from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle()
      setCurrentRole((roleRow?.role as AppRole | null) ?? null)
    })()
  }, [])

  async function fetchRdv(opts?: { page?: number }) {
    setLoading(true); setLoadError('')
    const p = opts?.page ?? page
    const params = new URLSearchParams({ page: String(p), limit: String(pageSize) })
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (dateFrom)               params.set('date_from', new Date(dateFrom).toISOString())
    if (dateTo)                 params.set('date_to',   new Date(dateTo + 'T23:59:59').toISOString())
    if (search.trim())          params.set('search', search.trim())
    const res = await fetch(`/api/saas-rdv?${params.toString()}`)
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setLoadError(json?.error ?? 'Erreur de chargement.')
      setRows([]); setTotal(0); return
    }
    setRows((json.rdv ?? []) as RdvWithProspect[])
    setTotal(json.total ?? 0)
  }

  useEffect(() => { fetchRdv({ page: 1 }); setPage(1) /* eslint-disable-next-line */ }, [filterStatus, dateFrom, dateTo, pageSize])
  useEffect(() => { fetchRdv() /* eslint-disable-next-line */ }, [page])
  useEffect(() => {
    const t = setTimeout(() => { fetchRdv({ page: 1 }); setPage(1) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [search])

  // ── Prospect search for the create modal ─────────────────────────
  useEffect(() => {
    if (!form || form.id) { setProspectOptions([]); return }
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ limit: '20' })
      if (prospectQuery.trim()) params.set('search', prospectQuery.trim())
      const res = await fetch(`/api/saas-prospects?${params.toString()}`)
      if (!res.ok) return
      const json = await res.json()
      setProspectOptions((json.prospects ?? []) as SaasProspect[])
    }, 200)
    return () => clearTimeout(t)
  }, [prospectQuery, form])

  const canDelete = currentRole === 'super_admin'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setError('')
    if (!form.prospect_id)  { setError('Sélectionnez un prospect.'); return }
    if (!form.scheduled_at) { setError('Date et heure requises.'); return }
    setSaving(true)
    const payload = {
      prospect_id:  form.prospect_id,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      status:       form.status,
      notes:        form.notes.trim() || null,
    }
    const res = form.id
      ? await fetch(`/api/saas-rdv/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/saas-rdv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(json?.error ?? 'Erreur lors de la sauvegarde.'); return }
    setForm(null)
    flashToast(form.id ? 'RDV mis à jour' : 'RDV planifié')
    fetchRdv()
  }

  async function remove(r: RdvWithProspect) {
    if (!canDelete) return
    if (!confirm('Supprimer ce RDV ?')) return
    const res = await fetch(`/api/saas-rdv/${r.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j?.error ?? 'Erreur lors de la suppression.')
      return
    }
    flashToast('RDV supprimé')
    fetchRdv()
  }

  function openCreate() {
    setError('')
    setProspectQuery('')
    setForm({ ...empty })
  }

  function openEdit(r: RdvWithProspect) {
    setError('')
    setForm({
      id:           r.id,
      prospect_id:  r.prospect_id,
      scheduled_at: isoToLocalInput(r.scheduled_at),
      status:       r.status,
      notes:        r.notes ?? '',
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const fromIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const toIdx   = Math.min(safePage * pageSize, total)

  const selectedProspect = useMemo(
    () => prospectOptions.find(p => p.id === form?.prospect_id) ?? null,
    [prospectOptions, form?.prospect_id],
  )

  return (
    <div className="p-10 pt-2 max-w-7xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Rendez-vous SaaS</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
            Démos planifiées avec les showrooms prospects.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <CalendarClock className="w-3.5 h-3.5" />
            {total} RDV
          </span>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Nouveau RDV
          </button>
        </div>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] shadow-sm overflow-hidden"
      >
        {/* Filters */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-950/40">
          <div className="relative w-full lg:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un prospect…"
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-12 pr-6 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100 placeholder:text-zinc-400 shadow-sm"
            />
            <Search className="absolute left-4 top-3 text-zinc-400 w-5 h-5 pointer-events-none" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | SaasRdvStatus)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tous les statuts</option>
              {SAAS_RDV_STATUS_VALUES.map(s => (
                <option key={s} value={s}>{SAAS_RDV_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <span className="text-xs text-zinc-500">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {loadError && (
          <div className="px-6 py-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200/40">
            {loadError}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Date / heure</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Prospect</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Statut</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Notes</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 cursor-pointer" onClick={() => openEdit(r)}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-zinc-900 dark:text-white">
                      {format(new Date(r.scheduled_at), "EEE d MMM yyyy", { locale: fr })}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {format(new Date(r.scheduled_at), 'HH:mm', { locale: fr })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-zinc-900 dark:text-white">
                      {r.prospect?.full_name ?? '—'}
                    </div>
                    {r.prospect && (
                      <>
                        <div className="text-xs text-zinc-500 mt-0.5 font-mono">{r.prospect.phone}</div>
                        <div className="text-xs text-zinc-500">{r.prospect.showroom_name}</div>
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${SAAS_RDV_STATUS_BADGE[r.status]}`}>
                      {SAAS_RDV_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-500 max-w-[220px] truncate">
                    {r.notes ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="Modifier"
                        onClick={(e) => { e.stopPropagation(); openEdit(r) }}
                        className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {canDelete && (
                        <button
                          title="Supprimer"
                          onClick={(e) => { e.stopPropagation(); remove(r) }}
                          className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && !loadError && (
            <div className="px-6 py-12 text-center text-sm text-zinc-500">
              Aucun RDV pour les filtres actuels.
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <span className="text-xs font-bold text-zinc-500">
            Affichage de {fromIdx} à {toIdx} sur {total}
          </span>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs font-bold text-zinc-700 dark:text-zinc-200"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                Précédent
              </button>
              <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-zinc-200 dark:border-zinc-700">
                {safePage}
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">
                {form.id ? 'Modifier le RDV' : 'Nouveau RDV'}
              </h3>
              <button onClick={() => setForm(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              {/* Prospect picker — disabled when editing */}
              {form.id ? (
                <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Prospect</p>
                  <p className="text-foreground font-medium" dir="auto">
                    {selectedProspect?.full_name ?? '— inconnu —'}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Prospect *</label>
                  <input
                    type="text"
                    value={prospectQuery}
                    onChange={(e) => setProspectQuery(e.target.value)}
                    placeholder="Rechercher par nom, téléphone ou showroom"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  {prospectOptions.length > 0 && (
                    <div className="mt-1 border border-border rounded-lg max-h-48 overflow-y-auto bg-background">
                      {prospectOptions.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setForm({ ...form, prospect_id: p.id })
                            setProspectQuery(`${p.full_name} · ${p.showroom_name}`)
                            setProspectOptions([])
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${form.prospect_id === p.id ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}
                        >
                          <div className="font-medium text-foreground" dir="auto">{p.full_name}</div>
                          <div className="text-xs text-muted-foreground">{p.showroom_name} · {p.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.prospect_id && (
                    <p className="text-[11px] text-emerald-600 mt-1">Prospect sélectionné</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Date et heure *</label>
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Statut</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as SaasRdvStatus })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                >
                  {SAAS_RDV_STATUS_VALUES.map(s => (
                    <option key={s} value={s}>{SAAS_RDV_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Sujet du RDV, prép, contexte…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>

              {error && <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 font-medium"
                >
                  {saving ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Planifier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
