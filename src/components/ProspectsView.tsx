'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search,
  Plus,
  MoreHorizontal,
  Mail,
  Phone,
  MessageSquare,
  Star,
  Download,
  Pencil,
  Trash2,
  MessageCircle,
  Eye,
  Clock,
  AlertOctagon,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadSuivi,
  type LeadOrderType,
  type LeadTemperature,
  type Vehicle,
  LEAD_SUIVI_LABELS,
  LEAD_SUIVI_VALUES,
  LEAD_SUIVI_BADGE_CLASSES,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_BADGE_CLASSES,
} from '@/lib/types'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AddLeadModal } from '@/components/AddLeadModal'
import { EditLeadModal } from '@/components/EditLeadModal'
import { ConfirmVenteModal } from '@/components/ConfirmVenteModal'
import LeadDetailModal from '@/components/LeadDetailModal'

// ── Map real Lead.status (DB enum) → display label used by the design ──
type DisplayStatus = 'Chaud' | 'En cours' | 'Nouveau' | 'Froid' | 'Contacté'

function toDisplayStatus(s: Lead['status']): DisplayStatus {
  switch (s) {
    case 'new':       return 'Nouveau'
    case 'contacted': return 'Contacté'
    case 'qualified': return 'En cours'
    case 'proposal':  return 'Chaud'
    case 'won':       return 'Contacté'
    case 'lost':      return 'Froid'
  }
}

function formatDate(d: string): string {
  const date = new Date(d)
  if (isToday(date))     return "Aujourd'hui"
  if (isYesterday(date)) return 'Hier'
  return format(date, 'd MMM', { locale: fr })
}

// VIP heuristic: high budget signals priority lead.
const VIP_BUDGET_THRESHOLD = 5_000_000

// ── Phone formatting (Algeria default) ──────────────────────────────
// Returns the phone in international format suitable for tel:/sms: links
// (with leading +) and for wa.me URLs (digits only, no +).
// Returns null when no usable number is provided.
function formatPhoneIntl(raw: string | null | undefined): { tel: string; wa: string } | null {
  if (!raw) return null
  // Keep only digits and a possible leading "+"
  let s = raw.trim().replace(/[^\d+]/g, '')
  if (!s) return null
  if (s.startsWith('+')) {
    const digits = s.slice(1)
    if (!digits) return null
    return { tel: `+${digits}`, wa: digits }
  }
  if (s.startsWith('00')) s = s.slice(2)
  if (s.startsWith('0')) s = s.slice(1)
  // If the user already typed "213…", don't double-prefix.
  const digits = s.startsWith('213') ? s : `213${s}`
  if (!digits) return null
  return { tel: `+${digits}`, wa: digits }
}

const statusStyles = {
  'Chaud': 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200/50 dark:border-rose-500/20',
  'En cours': 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20',
  'Nouveau': 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-500/20',
  'Froid': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/50 dark:border-slate-700/50',
  'Contacté': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20',
}

const PAGE_SIZE_OPTIONS = [15, 30, 50, 80, 150] as const
const DEFAULT_PAGE_SIZE = 15

export function ProspectsView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [addOpen, setAddOpen] = useState(false)
  const [suiviFilter, setSuiviFilter] = useState<'all' | LeadSuivi>('all')
  // migration_27: split catalog leads by order_type. 'all' keeps the
  // current behaviour (tous les prospects).
  const [orderTab, setOrderTab] = useState<'all' | LeadOrderType>('all')
  // migration_28: filter + sort by lead temperature.
  const [tempFilter, setTempFilter] = useState<'all' | LeadTemperature>('all')
  const [tempSortDesc, setTempSortDesc] = useState(true)
  const [sortByTemp, setSortByTemp] = useState(false)

  // migration_34: optional ?filter=pending|escalated URL param. Read
  // once at mount; we don't push it back into the URL so the existing
  // filters keep working as the user navigates within the page.
  const searchParams = useSearchParams()
  const reminderFilter = (searchParams?.get('filter') ?? null) as
    'pending' | 'escalated' | null
  // Current user id — used by the 'pending' filter to scope to leads
  // assigned to the caller. Fetched on mount.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id ?? null)
    })
  }, [])
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [contactPopover, setContactPopover] = useState<
    { id: string; kind: 'call' | 'msg' } | null
  >(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  // "Fiche Lead" — read-only consultation modal.
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [vehiclesById, setVehiclesById] = useState<Record<string, Vehicle>>({})
  // Vente confirmation handed off from EditLeadModal when a lead is
  // transitioning to suivi='vendu'. The modal captures the final price
  // and atomically writes the vente row + flips vehicle status + suivi.
  const [venteTarget, setVenteTarget] = useState<
    { lead: Lead; vehicle: Vehicle | null } | null
  >(null)
  const [toast, setToast] = useState<string | null>(null)
  function flashToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  async function fetchLeads() {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    setLeads((data ?? []) as Lead[])
  }

  async function fetchVehicles() {
    const { data } = await supabase.from('vehicles').select('*')
    const map: Record<string, Vehicle> = {}
    for (const v of (data ?? []) as Vehicle[]) map[v.id] = v
    setVehiclesById(map)
  }

  useEffect(() => { fetchLeads(); fetchVehicles() }, [])

  // Close kebab menu / contact popover on outside click / escape
  useEffect(() => {
    if (!menuOpenId && !contactPopover) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('[data-lead-menu]')) return
      if (t && t.closest('[data-contact-popover]')) return
      setMenuOpenId(null)
      setContactPopover(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpenId(null); setContactPopover(null) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpenId, contactPopover])

  async function updateSuivi(id: string, suivi: LeadSuivi | null) {
    const previous = leads.find((l) => l.id === id)
    if ((previous?.suivi ?? null) === suivi) return
    const newLabel = suivi ? LEAD_SUIVI_LABELS[suivi] : 'Aucun'
    if (!confirm(`Êtes-vous sûr de vouloir changer le suivi en ${newLabel} ?`)) return
    // Optimistic update so the badge color flips immediately.
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, suivi } : l)))

    // Special case: "RDV planifié" / "Vendu" need a vehicle picked — open the
    // edit modal pre-set so the user lands directly on the vehicle picker.
    if (suivi === 'rdv_planifie' || suivi === 'vendu') {
      if (previous) setEditingLead({ ...previous, suivi })
    } else {
      // Moving away from rdv/vendu: release the vehicle this lead was holding
      // so it goes back to "Disponible". Only release if this lead actually
      // owned the reservation.
      if (previous?.vehicle_id) {
        const veh = vehiclesById[previous.vehicle_id]
        if (veh && veh.reserved_by_lead_id === id &&
            (veh.status === 'reserved' || veh.status === 'sold')) {
          await supabase
            .from('vehicles')
            .update({ status: 'available', reserved_by_lead_id: null })
            .eq('id', previous.vehicle_id)
          fetchVehicles()
        }
      }
    }

    const { error: err } = await supabase
      .from('leads')
      .update({ suivi })
      .eq('id', id)
    if (err) {
      console.warn('[ProspectsView] failed to update suivi:', err.message)
      if (/suivi/i.test(err.message)) {
        alert(
          "La colonne 'suivi' n'existe pas dans la base. Exécutez supabase/migration_07_leads_suivi.sql pour activer ce champ."
        )
      }
      // Rollback on failure.
      fetchLeads()
    }
  }

  async function deleteLead(id: string) {
    if (!confirm('Supprimer ce prospect ? Cette action est irréversible.')) return
    // Release any vehicle this lead was holding before we delete the lead row.
    const target = leads.find((l) => l.id === id)
    if (target?.vehicle_id) {
      const veh = vehiclesById[target.vehicle_id]
      if (veh && veh.reserved_by_lead_id === id &&
          (veh.status === 'reserved' || veh.status === 'sold')) {
        await supabase
          .from('vehicles')
          .update({ status: 'available', reserved_by_lead_id: null })
          .eq('id', target.vehicle_id)
      }
    }
    setLeads((prev) => prev.filter((l) => l.id !== id))
    await supabase.from('leads').delete().eq('id', id)
    fetchVehicles()
  }

  function exportCsv() {
    const header = ['Nom', 'Email', 'Téléphone', 'Wilaya', 'Modèle', 'Source', 'Statut', 'Créé le']
    const rows = leads.map((l) => [
      l.full_name,
      l.email ?? '',
      l.phone ?? '',
      l.wilaya ?? '',
      l.model_wanted ?? '',
      LEAD_SOURCE_LABELS[l.source] ?? l.source,
      LEAD_STATUS_LABELS[l.status],
      l.created_at,
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Tab counts (migration_27) ───────────────────────────────────
  // Independent of suivi/search filters so the user sees how many
  // catalog orders exist regardless of what's currently filtered.
  // Excludes vendu (sold) leads to stay consistent with the default
  // "Tous" behaviour below.
  const orderTabCounts = useMemo(() => {
    let all = 0, vehicle = 0, preorder = 0
    for (const l of leads) {
      if (l.suivi === 'vendu') continue
      all++
      if (l.order_type === 'vehicle')  vehicle++
      else if (l.order_type === 'preorder') preorder++
    }
    return { all, vehicle, preorder }
  }, [leads])

  // Real backend rows shaped for the design template — UI structure unchanged.
  const prospectsData = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads
      .filter((l) => {
        // Vendu leads belong on the Ventes page — hide them from the
        // Prospects list by default. Admins / managers can still find them
        // by explicitly picking "Vendu" in the filter dropdown.
        if (suiviFilter === 'all') {
          if (l.suivi === 'vendu') return false
        } else if (l.suivi !== suiviFilter) {
          return false
        }
        // Tab filter (migration_27).
        if (orderTab !== 'all' && l.order_type !== orderTab) return false

        // Temperature filter (migration_28).
        if (tempFilter !== 'all' && l.temperature !== tempFilter) return false

        // Reminder URL filter (migration_34).
        if (reminderFilter === 'pending') {
          if ((l.reminder_count ?? 0) <= 0) return false
          if (currentUserId && l.assigned_to !== currentUserId) return false
        } else if (reminderFilter === 'escalated') {
          if (!l.escalated) return false
        }

        if (!term) return true
        return (
          l.full_name.toLowerCase().includes(term) ||
          (l.email ?? '').toLowerCase().includes(term) ||
          (l.phone ?? '').toLowerCase().includes(term) ||
          (l.model_wanted ?? '').toLowerCase().includes(term)
        )
      })
      .map((l) => {
        // Resolve the linked vehicle (if any) to a human label.
        const linked = l.vehicle_id ? vehiclesById[l.vehicle_id] : undefined
        const linkedLabel = linked
          ? [linked.brand, linked.model, linked.year ? String(linked.year) : '']
              .filter(Boolean)
              .join(' ')
          : null
        return {
          id: l.id,
          rawPhone: l.phone,
          rawEmail: l.email,
          name: l.full_name,
          email: l.email ?? '—',
          phone: l.phone ?? '—',
          car: linkedLabel ?? l.model_wanted ?? '—',
          isLinked: !!linkedLabel,
          status: toDisplayStatus(l.status),
          suivi: (l.suivi ?? null) as LeadSuivi | null,
          orderType: (l.order_type ?? null) as LeadOrderType | null,
          temperature: (l.temperature ?? null) as LeadTemperature | null,
          temperatureScore: (l.temperature_score ?? null) as number | null,
          // migration_34 — reminder + escalation indicators.
          reminderCount:    (l.reminder_count ?? 0) as number,
          lastContactedAt:  (l.last_contacted_at ?? null) as string | null,
          escalated:        !!l.escalated,
          bestCallHour: (l.best_call_hour ?? null) as number | null,
          notes: l.notes ?? '',
          source: LEAD_SOURCE_LABELS[l.source] ?? l.source,
          date: formatDate(l.created_at),
          isVip: !!(l.budget_dzd && l.budget_dzd >= VIP_BUDGET_THRESHOLD),
        }
      })
  }, [leads, search, suiviFilter, orderTab, tempFilter, reminderFilter, currentUserId, vehiclesById])

  // Sort by temperature_score when the column header is active. When
  // not active, leave the order as the default (created_at DESC, set by
  // fetchLeads). Falsy/null scores sort to the bottom in DESC, top in ASC.
  const sortedProspectsData = useMemo(() => {
    if (!sortByTemp) return prospectsData
    const copy = [...prospectsData]
    copy.sort((a, b) => {
      const av = a.temperatureScore
      const bv = b.temperatureScore
      if (av == null && bv == null) return 0
      if (av == null) return tempSortDesc ? 1 : -1
      if (bv == null) return tempSortDesc ? -1 : 1
      return tempSortDesc ? bv - av : av - bv
    })
    return copy
  }, [prospectsData, sortByTemp, tempSortDesc])

  const total = sortedProspectsData.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * pageSize
  const pageRows = sortedProspectsData.slice(startIdx, startIdx + pageSize)
  const fromLabel = total === 0 ? 0 : startIdx + 1
  const toLabel = Math.min(startIdx + pageSize, total)

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6 pb-12">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Prospects
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Gérez votre base de contacts et identifiez les meilleures opportunités.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium glass-card text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau prospect
          </button>
        </div>
      </div>

      {/* ── Order-type pill tabs (migration_27) ─────────────────── */}
      <div className="glass-card inline-flex items-center gap-1 p-1 rounded-xl animate-fade-in animate-delay-1">
        {(
          [
            { key: 'all',      label: 'Tous',                  count: orderTabCounts.all },
            { key: 'vehicle',  label: '🚗 Commandes véhicules', count: orderTabCounts.vehicle },
            { key: 'preorder', label: '📦 Pré-commandes',       count: orderTabCounts.preorder },
          ] as Array<{ key: 'all' | LeadOrderType; label: string; count: number }>
        ).map((t) => {
          const active = orderTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => { setOrderTab(t.key); setPage(1) }}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                active
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-zinc-100 dark:hover:bg-white/[0.04]',
              )}
            >
              <span>{t.label}</span>
              <span className={cn(
                'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-bold rounded-full',
                active
                  ? 'bg-white/20 text-white'
                  : 'bg-zinc-200 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-300',
              )}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Filters bar ─────────────────────────────────────────── */}
      <div className="glass-card p-4 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3 animate-fade-in animate-delay-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher un nom, email, véhicule..."
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-xl text-sm',
              'bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400',
              'dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white dark:placeholder:text-zinc-500',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition',
            )}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] shrink-0">
              Suivi
            </span>
            <select
              value={suiviFilter}
              onChange={(e) => { setSuiviFilter(e.target.value as 'all' | LeadSuivi); setPage(1) }}
              className={cn(
                'px-3 py-2 rounded-xl text-sm font-medium cursor-pointer transition',
                'bg-zinc-50 border border-zinc-200 text-zinc-900',
                'dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50',
              )}
            >
              <option value="all">Tous</option>
              {LEAD_SUIVI_VALUES.map((s) => (
                <option key={s} value={s}>{LEAD_SUIVI_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Temperature filter (migration_28). */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] shrink-0">
              Temp.
              </span>
            <select
              value={tempFilter}
              onChange={(e) => { setTempFilter(e.target.value as 'all' | LeadTemperature); setPage(1) }}
              className={cn(
                'px-3 py-2 rounded-xl text-sm font-medium cursor-pointer transition',
                'bg-zinc-50 border border-zinc-200 text-zinc-900',
                'dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50',
              )}
            >
              <option value="all">Toutes</option>
              <option value="chaud">🔥 Chauds</option>
              <option value="tiede">🟡 Tièdes</option>
              <option value="froid">🧊 Froids</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Table card ──────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl overflow-hidden animate-fade-in animate-delay-3">
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-white/[0.02] border-b border-zinc-200 dark:border-white/[0.06]">
                <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-500">Contact</th>
                <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-500">Véhicule & Source</th>
                <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-500">Suivi</th>
                <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-500">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortByTemp) setTempSortDesc((d) => !d)
                      else { setSortByTemp(true); setTempSortDesc(true) }
                      setPage(1)
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs uppercase tracking-wider font-medium transition-colors',
                      sortByTemp
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300',
                    )}
                    title="Trier par température"
                  >
                    Température
                    <span aria-hidden="true" className="text-[9px]">
                      {sortByTemp ? (tempSortDesc ? '▼' : '▲') : '↕'}
                    </span>
                  </button>
                </th>
                <th className="px-5 py-3 text-xs uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-500">Date</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
              {pageRows.map((prospect) => (
                <tr
                  key={prospect.id}
                  onClick={() => {
                    const full = leads.find((l) => l.id === prospect.id)
                    if (full) setDetailLead(full)
                  }}
                  className="group cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors duration-150"
                >
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm',
                          prospect.isLinked
                            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/30'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300',
                        )}>
                          {prospect.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('')}
                        </div>
                        {prospect.isVip && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white dark:border-[var(--bg-surface)]">
                            <Star className="w-2.5 h-2.5 text-white fill-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-900 dark:text-white inline-flex items-center gap-1.5">
                          <span>{prospect.name}</span>
                          {prospect.escalated ? (
                            <span
                              title="Escalade — non contacté malgré rappels"
                              className="inline-flex items-center text-rose-600 dark:text-rose-400"
                            >
                              <AlertOctagon className="w-3.5 h-3.5" />
                            </span>
                          ) : prospect.reminderCount > 0 && (
                            <span
                              title={
                                'Rappel actif #' + prospect.reminderCount +
                                (prospect.lastContactedAt
                                  ? ' · Dernier contact : ' + new Date(prospect.lastContactedAt).toLocaleDateString('fr-DZ')
                                  : ' · Jamais contacté')
                              }
                              className="inline-flex items-center text-orange-500 dark:text-orange-400"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-zinc-500 dark:text-zinc-400">
                          <div className="flex items-center gap-1" title={prospect.email}>
                            <Mail className="w-3 h-3" />
                            <span className="text-sm truncate max-w-[140px]">{prospect.email}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span className="text-sm">{prospect.phone}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-5">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                      <span className="truncate">{prospect.car}</span>
                      {prospect.isLinked && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 shrink-0">
                          Lié
                        </span>
                      )}
                      {prospect.orderType === 'vehicle' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 shrink-0">
                          🚗 Véhicule
                        </span>
                      )}
                      {prospect.orderType === 'preorder' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30 shrink-0">
                          📦 Pré-commande
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{prospect.source}</div>
                  </td>
                  <td className="py-4 px-5 max-w-[220px]" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-block">
                      <select
                        value={prospect.suivi ?? ''}
                        onChange={(e) =>
                          updateSuivi(
                            prospect.id,
                            e.target.value ? (e.target.value as LeadSuivi) : null
                          )
                        }
                        className={cn(
                          'appearance-none cursor-pointer pl-3 pr-7 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30',
                          prospect.suivi
                            ? LEAD_SUIVI_BADGE_CLASSES[prospect.suivi]
                            : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-white/[0.04] dark:text-zinc-400 dark:border-white/[0.06]',
                        )}
                      >
                        <option value="">—</option>
                        {LEAD_SUIVI_VALUES.filter((s) => s !== 'vendu').map((s) => (
                          <option key={s} value={s}>{LEAD_SUIVI_LABELS[s]}</option>
                        ))}
                      </select>
                      <svg
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-70"
                        viewBox="0 0 20 20" fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {prospect.notes && (
                      <div
                        title={prospect.notes}
                        className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate"
                      >
                        {prospect.notes}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-5">
                    {prospect.temperature ? (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-black border tabular-nums',
                          LEAD_TEMPERATURE_BADGE_CLASSES[prospect.temperature],
                        )}
                        title={
                          prospect.temperatureScore != null
                            ? `Score : ${prospect.temperatureScore}/100`
                            : undefined
                        }
                      >
                        {LEAD_TEMPERATURE_LABELS[prospect.temperature]}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-4 px-5 text-sm text-zinc-500 dark:text-zinc-400">
                    {prospect.date}
                  </td>
                  <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {(() => {
                        const intl = formatPhoneIntl(prospect.rawPhone)
                        const hasPhone = !!intl
                        const noPhoneTitle = 'Pas de numéro de téléphone'
                        return (
                          <>
                            {/* Call button + popover */}
                            <div className="relative" data-contact-popover>
                              <button
                                type="button"
                                disabled={!hasPhone}
                                onClick={() =>
                                  setContactPopover((cur) =>
                                    cur && cur.id === prospect.id && cur.kind === 'call'
                                      ? null
                                      : { id: prospect.id, kind: 'call' }
                                  )
                                }
                                aria-haspopup="menu"
                                aria-expanded={contactPopover?.id === prospect.id && contactPopover?.kind === 'call'}
                                className={cn(
                                  'w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors',
                                  'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-emerald-600',
                                  'dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-emerald-400',
                                  !hasPhone && 'opacity-40 cursor-not-allowed',
                                )}
                                title={
                                  hasPhone
                                    ? prospect.bestCallHour != null
                                      ? `Appeler ${prospect.rawPhone}\nMeilleur moment : ${prospect.bestCallHour}h – ${(prospect.bestCallHour + 2) % 24}h`
                                      : `Appeler ${prospect.rawPhone}`
                                    : noPhoneTitle
                                }
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                              {hasPhone && contactPopover?.id === prospect.id && contactPopover?.kind === 'call' && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full mt-2 z-30 w-52 rounded-xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-[#0a0a0e]/95 dark:backdrop-blur-xl shadow-2xl py-1 text-left"
                                >
                                  <a
                                    href={`tel:${intl!.tel}`}
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                                  >
                                    <Phone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    Appel téléphonique
                                  </a>
                                  <a
                                    href={`https://wa.me/${intl!.wa}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                                  >
                                    <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    Appel WhatsApp
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Message button + popover */}
                            <div className="relative" data-contact-popover>
                              <button
                                type="button"
                                disabled={!hasPhone}
                                onClick={() =>
                                  setContactPopover((cur) =>
                                    cur && cur.id === prospect.id && cur.kind === 'msg'
                                      ? null
                                      : { id: prospect.id, kind: 'msg' }
                                  )
                                }
                                aria-haspopup="menu"
                                aria-expanded={contactPopover?.id === prospect.id && contactPopover?.kind === 'msg'}
                                className={cn(
                                  'w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors',
                                  'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-blue-600',
                                  'dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-blue-400',
                                  !hasPhone && 'opacity-40 cursor-not-allowed',
                                )}
                                title={hasPhone ? `Message à ${prospect.rawPhone}` : noPhoneTitle}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              {hasPhone && contactPopover?.id === prospect.id && contactPopover?.kind === 'msg' && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full mt-2 z-30 w-52 rounded-xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-[#0a0a0e]/95 dark:backdrop-blur-xl shadow-2xl py-1 text-left"
                                >
                                  <a
                                    href={`sms:${intl!.tel}`}
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                                  >
                                    <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    SMS
                                  </a>
                                  <a
                                    href={`https://wa.me/${intl!.wa}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setContactPopover(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                                  >
                                    <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    WhatsApp
                                  </a>
                                </div>
                              )}
                            </div>
                          </>
                        )
                      })()}
                      <div className="relative" data-lead-menu>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === prospect.id ? null : prospect.id)}
                          className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white transition-colors"
                          aria-label="Options"
                          aria-haspopup="menu"
                          aria-expanded={menuOpenId === prospect.id}
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                        {menuOpenId === prospect.id && (
                          <div
                            role="menu"
                            className="absolute right-0 top-full mt-2 z-30 w-44 rounded-xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-[#0a0a0e]/95 dark:backdrop-blur-xl shadow-2xl py-1 text-left"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const full = leads.find((l) => l.id === prospect.id)
                                if (full) setDetailLead(full)
                                setMenuOpenId(null)
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                            >
                              <Eye className="w-4 h-4" />
                              Voir la fiche
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const full = leads.find((l) => l.id === prospect.id)
                                if (full) setEditingLead(full)
                                setMenuOpenId(null)
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                            >
                              <Pencil className="w-4 h-4" />
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => { setMenuOpenId(null); deleteLead(prospect.id) }}
                              className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Empty state */}
          {pageRows.length === 0 && (
            <div className="px-6 py-16 flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] flex items-center justify-center">
                <Users className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
              </div>
              <p className="text-base font-medium text-zinc-700 dark:text-zinc-300 mt-2">Aucun prospect trouvé</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Ajustez vos filtres ou créez un nouveau prospect pour commencer.
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-zinc-500 dark:text-zinc-500">
            Affichage de <span className="font-medium text-zinc-700 dark:text-zinc-300">{fromLabel}</span> à <span className="font-medium text-zinc-700 dark:text-zinc-300">{toLabel}</span> sur <span className="font-medium text-zinc-700 dark:text-zinc-300">{total}</span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className={cn(
                  'px-2 py-1 rounded-lg text-xs font-medium cursor-pointer transition',
                  'bg-zinc-50 border border-zinc-200 text-zinc-700',
                  'dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-zinc-200',
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500/30',
                )}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">par page</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-xs font-medium bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Page précédente"
              >
                ‹
              </button>
              <button
                aria-current="page"
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-xs font-semibold bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
              >
                {safePage}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-xs font-medium bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Page suivante"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      <AddLeadModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={fetchLeads}
      />

      <EditLeadModal
        lead={editingLead}
        onClose={() => setEditingLead(null)}
        onSaved={(info) => {
          fetchLeads(); fetchVehicles()
          if (info?.askVenteFor) {
            setVenteTarget(info.askVenteFor)
          }
        }}
      />

      {/* Read-only "Fiche Lead" — opens on row click or "Voir la fiche".
          The Modifier action inside the modal closes the detail view
          and hands off to the EditLeadModal. */}
      <LeadDetailModal
        open={!!detailLead}
        lead={detailLead}
        onClose={() => setDetailLead(null)}
        onEdit={() => {
          const target = detailLead
          setDetailLead(null)
          if (target) setEditingLead(target)
        }}
      />

      {venteTarget && (
        <ConfirmVenteModal
          open={true}
          lead={venteTarget.lead}
          vehicle={venteTarget.vehicle}
          onClose={() => setVenteTarget(null)}
          onConfirmed={({ prix_vente }) => {
            const fmt = new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(prix_vente)
            flashToast(`Vente enregistrée — ${fmt} DA`)
            fetchLeads(); fetchVehicles()
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}
