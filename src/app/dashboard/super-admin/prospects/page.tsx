'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Plus, Search, Pencil, Trash2, X, Phone, MessageSquare, MessageCircle, Users,
  CalendarPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  type SaasProspect, type SaasSuivi, type SaasSource, type SaasShowroomSize,
  type SaasActivity,
  SAAS_SUIVI_VALUES, SAAS_SUIVI_LABELS, SAAS_SUIVI_BADGE,
  SAAS_SOURCE_VALUES, SAAS_SOURCE_LABELS,
  SAAS_SIZE_VALUES,   SAAS_SIZE_LABELS,
  SAAS_CANCELLATION_REASON_LABELS,
  type AppRole,
} from '@/lib/types'
import { CancelProspectModal } from '@/components/saas/CancelProspectModal'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const PAGE_SIZE_OPTIONS = [15, 30, 50, 80, 150] as const
type PageSize = typeof PAGE_SIZE_OPTIONS[number]

type InternalUser = { user_id: string; email: string | null; role: AppRole }

// ── Phone action buttons (Call / SMS / WhatsApp) ────────────────────
function formatPhoneIntl(raw: string | null | undefined): { tel: string; wa: string } | null {
  if (!raw) return null
  const digits = String(raw).replace(/[^\d]/g, '')
  if (!digits) return null
  // Phones from the API are already +213XXXXXXXXX → digits = 213XXXXXXXXX.
  return { tel: `+${digits}`, wa: digits }
}

function PhoneActions({ phone }: { phone: string | null | undefined }) {
  const intl = formatPhoneIntl(phone)
  if (!intl) return <span className="text-xs text-zinc-400">—</span>
  return (
    <div className="flex items-center gap-1">
      <a
        href={`tel:${intl.tel}`}
        title={`Appeler ${phone}`}
        className="p-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <Phone className="w-3.5 h-3.5" />
      </a>
      <a
        href={`sms:${intl.tel}`}
        title="SMS"
        className="p-1.5 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 rounded-lg transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </a>
      <a
        href={`https://wa.me/${intl.wa}`}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        className="p-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <MessageCircle className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

type Form = {
  id: string | null
  full_name: string
  phone: string
  city: string
  showroom_name: string
  showroom_size: SaasShowroomSize | ''
  email: string
  notes: string
  source: SaasSource
  suivi: SaasSuivi
  assigned_to: string
}

const empty: Form = {
  id: null,
  full_name: '',
  phone: '',
  city: '',
  showroom_name: '',
  showroom_size: '',
  email: '',
  notes: '',
  source: 'manuel',
  suivi: 'nouveau',
  assigned_to: '',
}

export default function SuperAdminProspectsPage() {
  const [prospects, setProspects] = useState<SaasProspect[]>([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [filterSuivi, setFilterSuivi] = useState<'all' | SaasSuivi>('all')
  const [filterSource, setFilterSource] = useState<'all' | SaasSource>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(15)

  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [detail, setDetail] = useState<SaasProspect | null>(null)
  const [activities, setActivities] = useState<SaasActivity[]>([])
  const [loadingAct, setLoadingAct] = useState(false)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentRole, setCurrentRole]     = useState<AppRole | null>(null)
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([])

  const [toast, setToast] = useState<string | null>(null)
  function flashToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 2500)
  }

  // Cancellation modal — opened when the inline suivi dropdown picks 'annule'.
  const [cancelTarget, setCancelTarget] = useState<SaasProspect | null>(null)

  // ── Load me + role + internal users (for assignee picker) ──────────
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id ?? null
      setCurrentUserId(uid)
      if (uid) {
        const { data: roleRow } = await supabase
          .from('user_roles').select('role').eq('user_id', uid).maybeSingle()
        setCurrentRole((roleRow?.role as AppRole | null) ?? null)
      }
      // The list-internal-users endpoint is super_admin-only; for commercial /
      // prospecteur_saas we just expose themselves (a single-option assignee).
      try {
        const res = await fetch('/api/admin/list-internal-users')
        if (res.ok) {
          const json = await res.json()
          setInternalUsers((json.users ?? []) as InternalUser[])
        }
      } catch { /* ignore — non-super-admins fall back to "me only" */ }
    })()
  }, [])

  // ── Fetch prospects ────────────────────────────────────────────────
  async function fetchProspects(opts?: { page?: number }) {
    setLoading(true); setLoadError('')
    const p = opts?.page ?? page
    const params = new URLSearchParams({
      page:  String(p),
      limit: String(pageSize),
    })
    if (filterSuivi  !== 'all') params.set('suivi',  filterSuivi)
    if (filterSource !== 'all') params.set('source', filterSource)
    if (search.trim()) params.set('search', search.trim())
    const res = await fetch(`/api/saas-prospects?${params.toString()}`)
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setLoadError(json?.error ?? 'Erreur de chargement.')
      setProspects([]); setTotal(0); return
    }
    setProspects((json.prospects ?? []) as SaasProspect[])
    setTotal(json.total ?? 0)
  }

  useEffect(() => { fetchProspects({ page: 1 }); setPage(1) /* eslint-disable-next-line */ }, [filterSuivi, filterSource, pageSize])
  useEffect(() => { fetchProspects() /* eslint-disable-next-line */ }, [page])

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => { fetchProspects({ page: 1 }); setPage(1) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [search])

  // ── Detail panel: load activities ──────────────────────────────────
  useEffect(() => {
    if (!detail) { setActivities([]); return }
    setLoadingAct(true)
    fetch(`/api/saas-prospects/${detail.id}/activities`)
      .then(r => r.json())
      .then(j => setActivities((j.activities ?? []) as SaasActivity[]))
      .catch(() => setActivities([]))
      .finally(() => setLoadingAct(false))
  }, [detail?.id])

  // ── Helpers ────────────────────────────────────────────────────────
  const canEditThis = (p: SaasProspect): boolean => {
    if (currentRole === 'super_admin' || currentRole === 'commercial') return true
    if (currentRole === 'prospecteur_saas') {
      return p.assigned_to === currentUserId || p.created_by === currentUserId
    }
    return false
  }
  const canDelete = currentRole === 'super_admin'
  const canPlanRdv = currentRole === 'super_admin' || currentRole === 'commercial'

  const userById = useMemo(() => {
    const m: Record<string, InternalUser> = {}
    for (const u of internalUsers) m[u.user_id] = u
    return m
  }, [internalUsers])

  // ── Inline suivi update from the table dropdown ────────────────────
  // For non-annule transitions we PATCH optimistically. For 'annule' we
  // open the cancellation modal (which does its own PATCH with the
  // mandatory reason) — never send a half-baked annule update from here.
  async function updateSuiviInline(p: SaasProspect, next: SaasSuivi) {
    if (next === p.suivi) return
    if (next === 'annule') {
      setCancelTarget(p)
      return
    }
    // Optimistic update.
    const prevSuivi = p.suivi
    setProspects((cur) => cur.map((row) => row.id === p.id ? { ...row, suivi: next } : row))
    if (detail?.id === p.id) setDetail((d) => d ? { ...d, suivi: next } : d)

    const res = await fetch(`/api/saas-prospects/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suivi: next }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Revert on error.
      setProspects((cur) => cur.map((row) => row.id === p.id ? { ...row, suivi: prevSuivi } : row))
      if (detail?.id === p.id) setDetail((d) => d ? { ...d, suivi: prevSuivi } : d)
      const msg = res.status === 403
        ? "Vous n'avez pas accès à ce prospect."
        : (json?.error ?? 'Erreur lors de la mise à jour.')
      flashToast(msg)
      return
    }
    // Replace with the server-canonical row (in case triggers added fields).
    if (json.prospect) {
      setProspects((cur) => cur.map((row) => row.id === p.id ? json.prospect : row))
      if (detail?.id === p.id) setDetail(json.prospect)
    }
    flashToast('Suivi mis à jour')
  }

  // ── Submit (create or edit) ────────────────────────────────────────
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setError('')
    if (!form.full_name.trim())     { setError('Nom requis.'); return }
    if (!form.phone.trim())         { setError('Téléphone requis.'); return }
    if (!form.showroom_name.trim()) { setError('Nom du showroom requis.'); return }
    setSaving(true)
    const payload: Record<string, unknown> = {
      full_name:     form.full_name.trim(),
      phone:         form.phone.trim(),
      city:          form.city.trim() || null,
      showroom_name: form.showroom_name.trim(),
      showroom_size: form.showroom_size || null,
      email:         form.email.trim() || null,
      notes:         form.notes.trim() || null,
      source:        form.source,
      suivi:         form.suivi,
      assigned_to:   form.assigned_to || null,
    }
    const res = form.id
      ? await fetch(`/api/saas-prospects/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/saas-prospects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(json?.error ?? 'Erreur lors de la sauvegarde.'); return }
    setForm(null)
    flashToast(form.id ? 'Prospect mis à jour' : 'Prospect créé')
    // Refresh list and detail (if open).
    fetchProspects()
    if (detail && json.prospect && detail.id === json.prospect.id) {
      setDetail(json.prospect as SaasProspect)
    }
  }

  async function remove(p: SaasProspect) {
    if (!canDelete) return
    if (!confirm(`Supprimer le prospect « ${p.full_name} » ? Cette action est irréversible.`)) return
    const res = await fetch(`/api/saas-prospects/${p.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j?.error ?? 'Erreur lors de la suppression.')
      return
    }
    if (detail?.id === p.id) setDetail(null)
    flashToast('Prospect supprimé')
    fetchProspects()
  }

  function openCreate() {
    setError('')
    setForm({
      ...empty,
      // For prospecteur_saas the API forces self-assign anyway; preset for clarity.
      assigned_to: currentRole === 'prospecteur_saas' ? (currentUserId ?? '') : '',
    })
  }

  function openEdit(p: SaasProspect) {
    setError('')
    setForm({
      id: p.id,
      full_name:     p.full_name,
      phone:         p.phone,
      city:          p.city ?? '',
      showroom_name: p.showroom_name,
      showroom_size: p.showroom_size ?? '',
      email:         p.email ?? '',
      notes:         p.notes ?? '',
      source:        p.source,
      suivi:         p.suivi,
      assigned_to:   p.assigned_to ?? '',
    })
  }

  // RDV creation modal (open from detail)
  const [rdvForm, setRdvForm] = useState<null | { prospect: SaasProspect; scheduled_at: string; notes: string; status: 'planifie' }>(null)
  async function submitRdv(e: React.FormEvent) {
    e.preventDefault()
    if (!rdvForm) return
    if (!rdvForm.scheduled_at) { alert('Date et heure requises.'); return }
    const res = await fetch('/api/saas-rdv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id:  rdvForm.prospect.id,
        scheduled_at: new Date(rdvForm.scheduled_at).toISOString(),
        notes:        rdvForm.notes.trim() || null,
        status:       rdvForm.status,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(json?.error ?? 'Erreur lors de la création du RDV.'); return }
    setRdvForm(null)
    flashToast('RDV planifié')
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const fromIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const toIdx   = Math.min(safePage * pageSize, total)

  return (
    <div className="p-10 pt-2 max-w-7xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Prospects SaaS</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
            Showrooms potentiels suivis par l&apos;équipe AutoDex.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {total} prospect{total > 1 ? 's' : ''}
          </span>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Nouveau prospect
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
          <div className="relative w-full lg:w-96">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom, téléphone, showroom…"
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-12 pr-6 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100 placeholder:text-zinc-400 shadow-sm"
            />
            <Search className="absolute left-4 top-3 text-zinc-400 w-5 h-5 pointer-events-none" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterSuivi}
              onChange={(e) => setFilterSuivi(e.target.value as 'all' | SaasSuivi)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tous les suivis</option>
              {SAAS_SUIVI_VALUES.map(s => (
                <option key={s} value={s}>{SAAS_SUIVI_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as 'all' | SaasSource)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Toutes les sources</option>
              {SAAS_SOURCE_VALUES.map(s => (
                <option key={s} value={s}>{SAAS_SOURCE_LABELS[s]}</option>
              ))}
            </select>
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
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Nom</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Téléphone</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Showroom</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Ville</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Source</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Suivi</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Assigné</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Créé le</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {prospects.map((p) => {
                const assigned = p.assigned_to ? userById[p.assigned_to] : null
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 cursor-pointer"
                    onClick={() => setDetail(p)}
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-zinc-900 dark:text-white" dir="auto">{p.full_name}</div>
                      {p.email && <div className="text-xs text-zinc-500 mt-0.5">{p.email}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{p.phone}</div>
                      <div className="mt-1"><PhoneActions phone={p.phone} /></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-zinc-900 dark:text-white">{p.showroom_name}</div>
                      {p.showroom_size && (
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-0.5">
                          {SAAS_SIZE_LABELS[p.showroom_size]}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">{p.city ?? '—'}</td>
                    <td className="px-6 py-4 text-xs text-zinc-500">{SAAS_SOURCE_LABELS[p.source]}</td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      {canEditThis(p) ? (
                        <div className="relative inline-block">
                          <select
                            value={p.suivi}
                            onChange={(e) => updateSuiviInline(p, e.target.value as SaasSuivi)}
                            className={cn(
                              'appearance-none cursor-pointer pl-3 pr-7 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border focus:outline-none focus:ring-2 focus:ring-indigo-500/30',
                              SAAS_SUIVI_BADGE[p.suivi],
                            )}
                          >
                            {SAAS_SUIVI_VALUES.map((s) => (
                              <option key={s} value={s}>{SAAS_SUIVI_LABELS[s]}</option>
                            ))}
                          </select>
                          <svg
                            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-70"
                            viewBox="0 0 20 20" fill="currentColor"
                          >
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${SAAS_SUIVI_BADGE[p.suivi]}`}>
                          {SAAS_SUIVI_LABELS[p.suivi]}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {assigned?.email ?? <span className="italic">—</span>}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {format(new Date(p.created_at), 'd MMM yyyy', { locale: fr })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEditThis(p) && (
                          <button
                            title="Modifier"
                            onClick={(e) => { e.stopPropagation(); openEdit(p) }}
                            className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            title="Supprimer"
                            onClick={(e) => { e.stopPropagation(); remove(p) }}
                            className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && prospects.length === 0 && !loadError && (
            <div className="px-6 py-12 text-center text-sm text-zinc-500">
              Aucun prospect. Cliquez sur « Nouveau prospect » pour commencer.
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

      {/* ── Toast ─────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}

      {/* ── Create / Edit modal ───────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">
                {form.id ? 'Modifier le prospect' : 'Nouveau prospect'}
              </h3>
              <button onClick={() => setForm(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Nom complet *</label>
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="ex. Karim Benali"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Téléphone *</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0555 XX XX XX (Algérie)"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Nom du showroom *</label>
                  <input
                    value={form.showroom_name}
                    onChange={(e) => setForm({ ...form, showroom_name: e.target.value })}
                    placeholder="ex. AutoSphère Alger"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Taille du showroom</label>
                  <select
                    value={form.showroom_size}
                    onChange={(e) => setForm({ ...form, showroom_size: e.target.value as SaasShowroomSize | '' })}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">— Non précisée —</option>
                    {SAAS_SIZE_VALUES.map(s => <option key={s} value={s}>{SAAS_SIZE_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Ville</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="ex. Alger"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="contact@showroom.dz"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Source</label>
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value as SaasSource })}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {SAAS_SOURCE_VALUES.map(s => <option key={s} value={s}>{SAAS_SOURCE_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Suivi</label>
                  <select
                    value={form.suivi}
                    onChange={(e) => setForm({ ...form, suivi: e.target.value as SaasSuivi })}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {SAAS_SUIVI_VALUES.map(s => <option key={s} value={s}>{SAAS_SUIVI_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Assigné à</label>
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                    disabled={currentRole === 'prospecteur_saas'}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                  >
                    <option value="">— Aucun —</option>
                    {internalUsers.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.email ?? u.user_id.slice(0, 8)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Observations, contexte commercial…"
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
                  {saving ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail panel ──────────────────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-semibold text-foreground" dir="auto">{detail.full_name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{detail.phone}</p>
              </div>
              <button onClick={() => setDetail(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Showroom</p>
                  <p className="text-foreground font-medium">{detail.showroom_name}</p>
                  {detail.showroom_size && (
                    <p className="text-xs text-muted-foreground">{SAAS_SIZE_LABELS[detail.showroom_size]}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Ville</p>
                  <p className="text-foreground">{detail.city ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Source</p>
                  <p className="text-foreground">{SAAS_SOURCE_LABELS[detail.source]}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Suivi</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${SAAS_SUIVI_BADGE[detail.suivi]}`}>
                    {SAAS_SUIVI_LABELS[detail.suivi]}
                  </span>
                </div>
                {detail.email && (
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Email</p>
                    <p className="text-foreground">{detail.email}</p>
                  </div>
                )}
                {detail.notes && (
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Notes</p>
                    <p className="text-foreground whitespace-pre-wrap text-xs">{detail.notes}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {canEditThis(detail) && (
                  <button
                    onClick={() => { openEdit(detail); setDetail(null) }}
                    className="px-4 py-2 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700 inline-flex items-center gap-1.5"
                  >
                    <Pencil className="w-4 h-4" /> Modifier
                  </button>
                )}
                {canPlanRdv && (
                  <button
                    onClick={() => setRdvForm({ prospect: detail, scheduled_at: '', notes: '', status: 'planifie' })}
                    className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1.5"
                  >
                    <CalendarPlus className="w-4 h-4" /> Planifier un RDV
                  </button>
                )}
              </div>

              {/* Cancellation block (read-only) */}
              {detail.suivi === 'annule' && (
                <div className="border-l-4 border-rose-500 bg-rose-50/60 dark:bg-rose-500/10 rounded-r-xl p-4 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300">
                    Annulation
                  </p>
                  <div className="text-sm text-foreground space-y-0.5">
                    <p>
                      <span className="text-muted-foreground">Raison : </span>
                      <span className="font-medium">
                        {detail.cancellation_reason
                          ? SAAS_CANCELLATION_REASON_LABELS[detail.cancellation_reason]
                          : '—'}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Commentaire : </span>
                      <span className="whitespace-pre-wrap">
                        {detail.cancellation_comment ?? '—'}
                      </span>
                    </p>
                    {detail.cancelled_at && (
                      <p>
                        <span className="text-muted-foreground">Annulé le : </span>
                        <span className="font-medium">
                          {format(new Date(detail.cancelled_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                        </span>
                      </p>
                    )}
                    {detail.cancelled_by && (
                      <p>
                        <span className="text-muted-foreground">Annulé par : </span>
                        <span className="font-medium">
                          {userById[detail.cancelled_by]?.email ?? '—'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Activity timeline */}
              <div className="border-t border-border pt-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black mb-3">
                  Activité ({activities.length})
                </p>
                {loadingAct ? (
                  <p className="text-xs text-muted-foreground">Chargement…</p>
                ) : activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune activité.</p>
                ) : (
                  <ul className="space-y-2">
                    {activities.map(a => (
                      <li key={a.id} className="flex gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-foreground">{a.description}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {format(new Date(a.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancellation modal (triggered by inline suivi dropdown) ─ */}
      {cancelTarget && (
        <CancelProspectModal
          open={true}
          prospect={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirmed={(updated) => {
            setProspects((cur) => cur.map((row) => row.id === updated.id ? updated : row))
            if (detail?.id === updated.id) setDetail(updated)
            flashToast('Prospect annulé')
          }}
        />
      )}

      {/* ── RDV creation modal (from detail panel) ────────────────── */}
      {rdvForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-card border border-border shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Planifier un RDV</h3>
              <button onClick={() => setRdvForm(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitRdv} className="px-6 py-5 space-y-4">
              <p className="text-sm text-foreground">
                Avec <span className="font-bold">{rdvForm.prospect.full_name}</span>{' '}
                ({rdvForm.prospect.showroom_name})
              </p>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Date et heure *</label>
                <input
                  type="datetime-local"
                  value={rdvForm.scheduled_at}
                  onChange={(e) => setRdvForm({ ...rdvForm, scheduled_at: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
                <textarea
                  value={rdvForm.notes}
                  onChange={(e) => setRdvForm({ ...rdvForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Sujet du RDV, prép, contexte…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRdvForm(null)}
                  className="px-4 py-2 rounded-lg text-sm text-foreground hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
                >
                  Planifier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// keep `Users` icon imported (used in the route stub previously); silences
// TS warnings if the linter complains about unused imports in some edits.
void Users
