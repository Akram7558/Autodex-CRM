'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalContractsList — client renderer for the contracts list page.
// ─────────────────────────────────────────────────────────────────────
// Status tabs (from RENTAL_TAB_GROUPS) + per-row quick transitions:
//   À-confirmer (draft / tentative_1/2/3 / reporter)
//                              → SuiviControl (free movement among the 4 suivi
//                                buckets) + Réserver (deposit modal) +
//                                Reporter (new dates modal) + Annuler
//   confirmed                  → Voiture récupérée / Annuler
//   active/overdue             → Terminer / Annuler
//   completed/cancelled        → terminal (no actions)
// SuiviControl PATCHes the status directly; "Réserver" → POST /reserve;
// "Voiture récupérée" → POST /pickup; "Reporter" → POST /report; "Annuler"
// → PATCH cancel. On success the row's status updates locally so it moves
// to the right tab. Labels + grouping come from centralized helpers — no
// hardcoded text. Desktop = table; mobile = stacked cards.
// ─────────────────────────────────────────────────────────────────────

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Flag, XCircle, Loader2, Plus, FileText, Car as CarIcon, User,
  CalendarClock, ChevronRight, ChevronDown, Trash2,
} from 'lucide-react'
import {
  RENTAL_TAB_GROUPS, rentalStatusLabel, rentalStatusColor, formatDZD, formatDateFr, toNum,
  RENTAL_FROM_PROSPECT_BADGE, RENTAL_FROM_PROSPECT_TITLE,
  RENTAL_ACTION_RESERVE, RENTAL_ACTION_PICKUP,
  isContractPendingStatus,
} from '@/components/rental/booking/types'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole, canSeeContractFinancials, canSeeAggregateRevenue } from '@/lib/auth'
import ContactButtons from '@/components/rental/ContactButtons'
import ReserveDialog from '@/components/rental/ReserveDialog'
import PickupDialog from '@/components/rental/PickupDialog'
import ReportDialog from '@/components/rental/ReportDialog'
import ContractSuiviControl from '@/components/rental/ContractSuiviControl'
import ChangeVehicleDialog from '@/components/rental/ChangeVehicleDialog'
import ContractExpandPanel from '@/components/rental/ContractExpandPanel'

// 'confirmed' removed (Reprogrammer button is gone). 'active' / 'reporter'
// stay in the union for symmetry with dialog-driven flows even though no
// PATCH onTransition call uses them today.
type ContractTransition = 'active' | 'completed' | 'cancelled' | 'reporter'

// One payment row attached to a contract (pre-fetched on the list page for
// financial viewers only). Mirrors ContractDetail's ContractPayment minus notes.
export type PaymentRow = {
  id:          string | null
  type:        string
  amount:      number
  method:      string
  reference:   string | null
  receipt_url: string | null
  created_at:  string
}

// One activity-log row attached to a contract (Chantier 3 — pre-fetched on
// the list page for financial viewers only; closers see no timeline in V1).
export type ActivityRow = {
  id:         string
  type:       string
  title:      string
  body:       string | null
  created_at: string
  actor:      { full_name: string } | null
}

export type ContractRow = {
  id:                  string
  contract_number:     string | null
  status:              string
  start_date:          string
  start_time:          string | null
  end_date:            string
  end_time:            string | null
  duration_days:       number
  total_rental_amount: number
  deposit_amount:      number
  created_at:          string
  vehicle:  { id: string; marque: string; modele: string; annee: number | null; immatriculation: string } | null
  customer: { full_name: string; phone: string } | null
  isFromProspect?:     boolean
  payments?:           PaymentRow[]    // populated only for financial viewers
  activities?:         ActivityRow[]   // populated only for financial viewers (Chantier 3)
}

// Small "RDV" pill for contracts that originated from a rental demande.
function RdvBadge() {
  return (
    <span
      title={RENTAL_FROM_PROSPECT_TITLE}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider align-middle"
      style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
    >
      <CalendarClock className="w-2.5 h-2.5" />{RENTAL_FROM_PROSPECT_BADGE}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = rentalStatusColor(status)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
    >
      {rentalStatusLabel(status)}
    </span>
  )
}

// ── Client fetch shapes (moved verbatim from the old server page) ────────
// Supabase embeds (rental_vehicle / customer) arrive as object OR 1-element
// array depending on the relationship inference; firstOf normalizes both.
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

type VehicleEmbed = { id: string; marque: string; modele: string; annee: number | null; immatriculation: string }
type CustomerEmbed = { full_name: string; phone: string }
type RawRow = {
  id: string
  contract_number: string | null
  status: string
  start_date: string
  start_time: string | null
  end_date: string
  end_time: string | null
  duration_days: number | null
  total_rental_amount: number | null
  deposit_amount: number | null
  created_at: string
  rental_vehicle: VehicleEmbed | VehicleEmbed[] | null
  customer: CustomerEmbed | CustomerEmbed[] | null
}

export default function RentalContractsList() {
  // Self-fetching (sales client-fetch pattern, mirroring VentesView): the
  // thin route renders this component immediately so the navigation commits
  // INSTANTLY; we then resolve role + load the list on mount behind an
  // internal skeleton. canFin / depositMinPercent are derived from the
  // client-side auth + settings read instead of arriving as server props.
  const [rows, setRows] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [canFin, setCanFin] = useState(false)
  // Corbeille (trash) is an admin gate (owner/manager/super_admin), DECOUPLED
  // from canFin so closers — who now see per-contract financials — never get
  // the bulk-trash checkboxes.
  const [canManageTrash, setCanManageTrash] = useState(false)
  const [depositMinPercent, setDepositMinPercent] = useState(5)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeKey, setActiveKey] = useState<string>(RENTAL_TAB_GROUPS[0].key) // default = first tab
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<ContractRow | null>(null)
  const [reserveTarget, setReserveTarget] = useState<ContractRow | null>(null)
  const [pickupTarget, setPickupTarget] = useState<ContractRow | null>(null)
  const [reportTarget, setReportTarget] = useState<ContractRow | null>(null)
  const [vehicleTarget, setVehicleTarget] = useState<ContractRow | null>(null)
  // Chantier 2 (step 2): expandable rows. Multiple may be open at once.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Soft-delete (corbeille): multi-select state, only used in the "Annulés"
  // (cancelled) tab for owner/manager/super_admin (canFin role set).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashBusy, setTrashBusy] = useState(false)
  // Single-layout-per-viewport (perf): instead of mounting BOTH the desktop
  // table and the mobile cards and CSS-hiding one, render only the one that
  // matches the viewport. SSR-safe: default true → server + first client paint
  // render the desktop table (no hydration mismatch); reconcile after mount and
  // keep reacting to resize across the md (768px) breakpoint.
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // ── Mount fetch (replaces the old server component) ────────────────────
  // Replicates the previous server query EXACTLY, just from the browser
  // client. RLS is the row-scoping boundary: the authed cookie session only
  // sees its own showroom (and a closer only their own rentals via the
  // assigned_to policy) — the explicit .eq() filters below mirror the old
  // server query for parity + defense-in-depth, NOT as the security boundary.
  // canFin gating is DISPLAY-ONLY (it just hides money UI + skips the
  // financial reads); the real protection for those tables is RLS.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      // Resolve identity/role/showroom client-side — the same mechanism the
      // sales Views use (supabase.auth.getUser() + user_roles via getCurrentUserRole).
      const me = await getCurrentUserRole()
      if (cancelled) return
      if (!me || (me.role !== 'owner' && me.role !== 'manager' && me.role !== 'closer' && me.role !== 'super_admin')) {
        // Middleware already gates this route; treat an unexpected/absent role
        // as an empty (non-financial) view rather than crashing.
        setRows([]); setCanFin(false); setCanManageTrash(false); setLoading(false)
        return
      }
      const { userId, role, showroomId } = me
      // Per-contract financials (payments/activities/expand-panel/réserver) now
      // INCLUDE closers — RLS scopes a closer to their OWN rentals, so they only
      // ever fetch their own contracts' money. The corbeille stays an
      // owner/manager/super_admin admin gate (canManageTrash), decoupled below.
      const fin = canSeeContractFinancials(role)
      const canTrash = canSeeAggregateRevenue(role)

      // Main list — EXACT old server filters: not trashed (deleted_at IS NULL),
      // newest first, cap 100, + showroom scope, + closer-on-own. NO status
      // filter (the tabs filter client-side and the pill counts need ALL statuses).
      let q = supabase
        .from('rentals')
        .select(
          'id, contract_number, status, start_date, start_time, end_date, end_time, ' +
          'duration_days, total_rental_amount, deposit_amount, created_at, ' +
          'rental_vehicle:rental_vehicles(id, marque, modele, annee, immatriculation), ' +
          'customer:rental_customers(full_name, phone)',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
      if (showroomId) q = q.eq('showroom_id', showroomId)
      if (role === 'closer') q = q.eq('assigned_to', userId)

      const { data, error: listErr } = await q
      if (cancelled) return
      if (listErr) {
        setLoadError('Impossible de charger les contrats.')
        setLoading(false)
        return
      }
      const raw = (data ?? []) as unknown as RawRow[]

      // Four independent follow-up reads, fired concurrently (mirrors the old
      // server Promise.all). rdvSet is NOT canFin-gated; payments/activities/
      // depositMin are — exactly like the server gate.
      const [rdvSet, paymentsByRental, activitiesByRental, depositMin] = await Promise.all([
        // Which of these contracts originated from a rental demande? Badge them.
        (async (): Promise<Set<string>> => {
          let lq = supabase
            .from('rental_prospects')
            .select('converted_rental_id')
            .not('converted_rental_id', 'is', null)
          if (showroomId) lq = lq.eq('showroom_id', showroomId)
          const { data: links } = await lq
          return new Set(
            (links ?? [])
              .map((l) => (l as { converted_rental_id: string | null }).converted_rental_id)
              .filter((v): v is string => !!v),
          )
        })(),
        // Payments for ALL rows in one query (financial roles only). RLS scopes.
        (async (): Promise<Map<string, PaymentRow[]>> => {
          const byRental = new Map<string, PaymentRow[]>()
          if (fin && raw.length > 0) {
            const { data: pays } = await supabase
              .from('rental_payments')
              .select('rental_id, id, type, amount, method, reference, receipt_url, created_at')
              .in('rental_id', raw.map((r) => r.id))
              .order('created_at', { ascending: true })
            for (const p of (pays ?? []) as Record<string, unknown>[]) {
              const rid = String(p.rental_id)
              const arr = byRental.get(rid) ?? []
              arr.push({
                id:          (p.id as string | null) ?? null,
                type:        String(p.type),
                amount:      toNum(p.amount),
                method:      String(p.method),
                reference:   (p.reference as string | null) ?? null,
                receipt_url: (p.receipt_url as string | null) ?? null,
                created_at:  String(p.created_at),
              })
              byRental.set(rid, arr)
            }
          }
          return byRental
        })(),
        // Activity log for ALL rows in one query (financial roles only). Newest
        // first, capped at 500 across the page; per-contract slicing is client-side.
        (async (): Promise<Map<string, ActivityRow[]>> => {
          const byRental = new Map<string, ActivityRow[]>()
          if (fin && raw.length > 0) {
            const { data: acts } = await supabase
              .from('rental_activities')
              .select('rental_id, id, type, title, body, created_at, actor:users(full_name)')
              .in('rental_id', raw.map((r) => r.id))
              .order('created_at', { ascending: false })
              .limit(500)
            for (const a of (acts ?? []) as Record<string, unknown>[]) {
              const rid = String(a.rental_id)
              const arr = byRental.get(rid) ?? []
              const actorEmbed = Array.isArray(a.actor) ? a.actor[0] : a.actor
              arr.push({
                id:         String(a.id),
                type:       String(a.type),
                title:      String(a.title),
                body:       (a.body as string | null) ?? null,
                created_at: String(a.created_at),
                actor:      actorEmbed
                  ? { full_name: String((actorEmbed as { full_name?: unknown }).full_name ?? '') }
                  : null,
              })
              byRental.set(rid, arr)
            }
          }
          return byRental
        })(),
        // Per-showroom minimum deposit % for the reserve dialog; 5% fallback.
        (async (): Promise<number> => {
          if (!showroomId) return 5
          const { data: settingsRow } = await supabase
            .from('rental_settings')
            .select('deposit_min_percent')
            .eq('showroom_id', showroomId)
            .maybeSingle()
          return Math.min(100, Math.max(5, Number(settingsRow?.deposit_min_percent ?? 5) || 5))
        })(),
      ])
      if (cancelled) return

      const mapped: ContractRow[] = raw.map((r) => ({
        id:                  r.id,
        contract_number:     r.contract_number ?? null,
        status:              r.status,
        start_date:          r.start_date,
        start_time:          r.start_time ?? null,
        end_date:            r.end_date,
        end_time:            r.end_time ?? null,
        duration_days:       Number(r.duration_days ?? 0),
        total_rental_amount: Number(r.total_rental_amount ?? 0),
        deposit_amount:      Number(r.deposit_amount ?? 0),
        created_at:          r.created_at,
        vehicle:             firstOf(r.rental_vehicle),
        customer:            firstOf(r.customer),
        isFromProspect:      rdvSet.has(r.id),
        payments:            fin ? (paymentsByRental.get(r.id) ?? []) : undefined,
        activities:          fin ? (activitiesByRental.get(r.id) ?? []) : undefined,
      }))

      setRows(mapped)
      setCanFin(fin)
      setCanManageTrash(canTrash)
      setDepositMinPercent(depositMin)
      setLoading(false)
    })().catch(() => {
      if (cancelled) return
      setLoadError('Impossible de charger les contrats.')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [reloadKey])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const countByKey = useMemo(() => {
    const m: Record<string, number> = {}
    for (const g of RENTAL_TAB_GROUPS) {
      m[g.key] = rows.filter((r) => (g.statuses as readonly string[]).includes(r.status)).length
    }
    return m
  }, [rows])

  const activeGroup = RENTAL_TAB_GROUPS.find((g) => g.key === activeKey) ?? RENTAL_TAB_GROUPS[0]
  // Memoized so typing in unrelated inputs / toggling rows doesn't re-filter the
  // whole list on every render. Keyed on rows + the active group.
  const visibleRows = useMemo(
    () => rows.filter((r) => (activeGroup.statuses as readonly string[]).includes(r.status)),
    [rows, activeGroup],
  )

  // Multi-select is offered ONLY in the cancelled ("Annulés") tab, and only to
  // roles allowed to trash (owner/manager/super_admin) — NOT closers, even
  // though closers now see per-contract financials.
  const showTrash = canManageTrash && activeKey === 'cancelled'
  const allSelected = showTrash && visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id))
  const selectedCount = visibleRows.filter((r) => selected.has(r.id)).length

  // Switch tab + drop any selection (selection only makes sense within the
  // cancelled tab).
  function pickTab(key: string) {
    setActiveKey(key)
    setSelected(new Set())
  }
  function toggleOne(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleRows.map((r) => r.id)))
  }

  async function confirmTrash() {
    const ids = visibleRows.filter((r) => selected.has(r.id)).map((r) => r.id)
    if (ids.length === 0) { setTrashOpen(false); return }
    setTrashBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/rental/rentals/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j?.message ?? j?.error ?? 'Mise à la corbeille échouée.')
        setTrashBusy(false)
        setTrashOpen(false)
        return
      }
      // Remove the trashed rows from local state instantly; they're filtered
      // out server-side on the next load too.
      const trashedSet = new Set(ids)
      setRows((rs) => rs.filter((r) => !trashedSet.has(r.id)))
      setSelected(new Set())
      setTrashBusy(false)
      setTrashOpen(false)
    } catch {
      setError('Erreur réseau. Réessayez.')
      setTrashBusy(false)
      setTrashOpen(false)
    }
  }

  // Chantier 1: SuiviControl direct status change (À-confirmer relance buckets).
  // Optimistic update + revert on PATCH failure, mirrors the prospects
  // changeStatus dance. The matrix on the server enforces the legal transitions.
  async function suiviChange(row: ContractRow, status: string) {
    const prev = row.status
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r)))
    setBusyId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/rental/rentals/${row.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) {
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: prev } : r)))
        setError(j?.message ?? j?.error ?? 'Mise à jour échouée.')
      }
    } catch {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: prev } : r)))
      setError('Erreur réseau. Réessayez.')
    } finally {
      setBusyId(null)
    }
  }

  async function transition(row: ContractRow, status: ContractTransition, reason?: string) {
    setBusyId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/rental/rentals/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(reason ? { cancellation_reason: reason } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.rental) {
        setError(j?.message ?? j?.error ?? 'Action échouée.')
        return false
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: j.rental.status } : r)))
      return true
    } catch {
      setError('Erreur réseau. Réessayez.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            <FileText className="w-3.5 h-3.5" /> Location
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">Contrats</h1>
        </div>
        <Link
          href="/dashboard/location/contrats/nouveau"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white hover:-translate-y-0.5 transition-transform"
          style={{ background: 'var(--accent)', boxShadow: '0 8px 22px -10px var(--accent-glow)' }}
        >
          <Plus className="w-4 h-4" /> Nouvelle location
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {RENTAL_TAB_GROUPS.map((g) => {
          const active = g.key === activeKey
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => pickTab(g.key)}
              aria-current={active ? 'page' : undefined}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
              style={active
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {g.label}
              <span
                className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] rounded-full tabular-nums"
                style={active
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
              >
                {countByKey[g.key] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-sm rounded-xl px-4 py-3"
          style={{ background: 'rgba(244,63,94,0.10)', color: '#fb7185', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,0.3)' }}>
          {error}
        </p>
      )}

      {loading ? (
        /* Internal skeleton — reuses the contrats/loading.tsx table shape.
           Header + tabs above stay live (instant) so only the data region
           shows a skeleton, mirroring the sibling client Views. */
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-2.5 flex items-center gap-3">
            <div className="h-3 w-16 rounded bg-[var(--bg-elevated)] animate-pulse opacity-70 shrink-0" />
            <div className="h-3 flex-1 min-w-0 rounded bg-[var(--bg-elevated)] animate-pulse opacity-70" />
            <div className="hidden sm:block h-3 w-24 rounded bg-[var(--bg-elevated)] animate-pulse opacity-70 shrink-0" />
            <div className="h-3 w-16 rounded bg-[var(--bg-elevated)] animate-pulse opacity-70 shrink-0" />
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="px-4 py-4 flex items-center gap-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="h-4 w-20 rounded bg-[var(--bg-elevated)] animate-pulse shrink-0" />
              <div className="h-4 flex-1 min-w-0 rounded bg-[var(--bg-elevated)] animate-pulse" />
              <div className="hidden sm:block h-4 w-28 rounded bg-[var(--bg-elevated)] animate-pulse shrink-0" />
              <div className="h-6 w-20 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        /* Graceful fetch-failure state with retry (re-runs the mount effect). */
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'rgba(244,63,94,0.12)', color: '#fb7185' }}>
            <FileText className="w-7 h-7" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{loadError}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Vérifiez votre connexion et réessayez.
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
      {/* Bulk action bar — visible in the "Annulés" tab once rows are picked. */}
      {showTrash && selectedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setTrashOpen(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#e11d48' }}
          >
            <Trash2 className="w-4 h-4" />
            Mettre à la corbeille ({selectedCount})
          </button>
        </div>
      )}

      {/* Empty state */}
      {visibleRows.length === 0 ? (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <FileText className="w-7 h-7" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Aucun contrat dans « {activeGroup.label} »</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Les contrats apparaîtront ici selon leur statut.
          </p>
        </div>
      ) : isDesktop ? (
          /* Desktop table — single layout per viewport (perf) */
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  {showTrash && (
                    <th className="px-4 py-2.5 w-10">
                      <input
                        type="checkbox"
                        aria-label="Tout sélectionner"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 cursor-pointer accent-rose-600 align-middle"
                      />
                    </th>
                  )}
                  <Th>Contrat</Th><Th>Véhicule</Th><Th>Client</Th><Th>Période</Th>
                  <Th>Total</Th><Th>Caution</Th><Th>Statut</Th><Th end>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const open = expanded.has(r.id)
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                        {showTrash && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Sélectionner ${r.contract_number ?? 'contrat'}`}
                              checked={selected.has(r.id)}
                              onChange={() => toggleOne(r.id)}
                              className="h-4 w-4 cursor-pointer accent-rose-600 align-middle"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleExpand(r.id)}
                              aria-expanded={open}
                              aria-label={open ? 'Réduire' : 'Développer'}
                              className="inline-flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-[var(--bg-elevated)]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <Link href={`/dashboard/location/contrats/${r.id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                              <bdi>{r.contract_number ?? 'Voir'}</bdi>
                            </Link>
                            {r.isFromProspect && <RdvBadge />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {r.vehicle ? <bdi>{r.vehicle.marque} {r.vehicle.modele}{r.vehicle.annee ? ` · ${r.vehicle.annee}` : ''}</bdi> : '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {r.customer ? (
                            <span><span className="text-[var(--text-primary)]">{r.customer.full_name}</span><br /><bdi className="text-xs tabular-nums">{r.customer.phone}</bdi></span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {formatDateFr(r.start_date)} → {formatDateFr(r.end_date)}<br />
                          <span className="text-[var(--text-muted)]">{r.duration_days} j</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[var(--text-primary)] tabular-nums"><bdi>{formatDZD(r.total_rental_amount)}</bdi></td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums"><bdi>{formatDZD(r.deposit_amount)}</bdi></td>
                        <td className="px-4 py-3">
                          {isContractPendingStatus(r.status)
                            ? <ContractSuiviControl value={r.status} busy={busyId === r.id} onChange={(next) => suiviChange(r, next)} />
                            : <StatusBadge status={r.status} />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <ContactButtons phone={r.customer?.phone ?? null} />
                            <RowActions row={r} busy={busyId === r.id} canFin={canFin} onTransition={transition} onReserve={() => setReserveTarget(r)} onPickup={() => setPickupTarget(r)} onReport={() => setReportTarget(r)} onCancel={() => setCancelTarget(r)} />
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={showTrash ? 9 : 8} className="p-0" style={{ borderTop: 'none' }}>
                            <div className="overflow-hidden animate-fade-in">
                              <ContractExpandPanel
                                row={r}
                                canFin={canFin}
                                onChangeVehicle={() => setVehicleTarget(r)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
      ) : (
          /* Mobile cards — single layout per viewport (perf) */
          <div className="space-y-3">
            {visibleRows.map((r) => {
              const open = expanded.has(r.id)
              return (
                <div key={r.id} className="rounded-2xl p-4 space-y-3"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {showTrash && (
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner ${r.contract_number ?? 'contrat'}`}
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          className="h-4 w-4 flex-shrink-0 cursor-pointer accent-rose-600"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.id)}
                        aria-expanded={open}
                        aria-label={open ? 'Réduire' : 'Développer'}
                        className="inline-flex items-center justify-center w-5 h-5 rounded flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <Link href={`/dashboard/location/contrats/${r.id}`} className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline truncate">
                        <bdi>{r.contract_number ?? 'Voir'}</bdi>
                      </Link>
                      {r.isFromProspect && <RdvBadge />}
                    </div>
                    {isContractPendingStatus(r.status)
                      ? <ContractSuiviControl value={r.status} busy={busyId === r.id} onChange={(next) => suiviChange(r, next)} />
                      : <StatusBadge status={r.status} />}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <CarIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    {r.vehicle ? <bdi>{r.vehicle.marque} {r.vehicle.modele}{r.vehicle.annee ? ` · ${r.vehicle.annee}` : ''}</bdi> : '—'}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    {r.customer ? <span>{r.customer.full_name} · <bdi className="tabular-nums">{r.customer.phone}</bdi></span> : '—'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDateFr(r.start_date)} → {formatDateFr(r.end_date)} · {r.duration_days} j
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Total <bdi className="font-semibold text-[var(--text-primary)] tabular-nums">{formatDZD(r.total_rental_amount)}</bdi></span>
                    <span style={{ color: 'var(--text-secondary)' }}>Caution <bdi className="tabular-nums">{formatDZD(r.deposit_amount)}</bdi></span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <ContactButtons phone={r.customer?.phone ?? null} />
                    <RowActions row={r} busy={busyId === r.id} canFin={canFin} onTransition={transition} onReserve={() => setReserveTarget(r)} onPickup={() => setPickupTarget(r)} onReport={() => setReportTarget(r)} onCancel={() => setCancelTarget(r)} />
                  </div>
                  {/* Expand panel — mounted only when open (perf) */}
                  {open && (
                    <div className="overflow-hidden animate-fade-in">
                      <div className="-mx-4 -mb-4 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                        <ContractExpandPanel row={r} canFin={canFin} onChangeVehicle={() => setVehicleTarget(r)} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
      )}
        </>
      )}

      {/* Soft-delete confirm — moves the picked cancelled contracts to the corbeille. */}
      {trashOpen && (
        <TrashDialog
          count={selectedCount}
          busy={trashBusy}
          onClose={() => setTrashOpen(false)}
          onConfirm={confirmTrash}
        />
      )}

      {/* Cancel confirm dialog */}
      {cancelTarget && (
        <CancelDialog
          row={cancelTarget}
          busy={busyId === cancelTarget.id}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (reason) => {
            const ok = await transition(cancelTarget, 'cancelled', reason)
            if (ok) setCancelTarget(null)
          }}
        />
      )}

      {/* Reserve (deposit) dialog — draft → confirmed */}
      {reserveTarget && (
        <ReserveDialog
          rentalId={reserveTarget.id}
          contractNumber={reserveTarget.contract_number}
          total={reserveTarget.total_rental_amount}
          depositAmount={reserveTarget.deposit_amount}
          minPercent={depositMinPercent}
          onClose={() => setReserveTarget(null)}
          onReserved={(r) => {
            setRows((prev) => prev.map((row) => (row.id === reserveTarget.id ? { ...row, status: r.rental.status } : row)))
            setReserveTarget(null)
          }}
        />
      )}

      {/* Pickup (settlement) dialog — confirmed → active */}
      {pickupTarget && (
        <PickupDialog
          rentalId={pickupTarget.id}
          contractNumber={pickupTarget.contract_number}
          onClose={() => setPickupTarget(null)}
          onPickedUp={(r) => {
            setRows((prev) => prev.map((row) => (row.id === pickupTarget.id ? { ...row, status: r.rental.status } : row)))
            setPickupTarget(null)
          }}
        />
      )}

      {/* Report (reschedule) dialog — {draft,confirmed,overdue} → reporter */}
      {reportTarget && (
        <ReportDialog
          rentalId={reportTarget.id}
          contractNumber={reportTarget.contract_number}
          onClose={() => setReportTarget(null)}
          onReported={(r) => {
            setRows((prev) => prev.map((row) => (
              row.id === reportTarget.id
                ? {
                    ...row,
                    status:              r.rental.status,
                    start_date:          r.rental.start_date,
                    end_date:            r.rental.end_date,
                    start_time:          r.rental.start_time,
                    end_time:            r.rental.end_time,
                    duration_days:       r.rental.duration_days,
                    total_rental_amount: r.rental.total_rental_amount,
                  }
                : row
            )))
            setReportTarget(null)
          }}
        />
      )}

      {/* Change-vehicle dialog (Chantier 2) — server recomputes rate/caution/total */}
      {vehicleTarget && (
        <ChangeVehicleDialog
          kind="contract"
          id={vehicleTarget.id}
          currentVehicleId={vehicleTarget.vehicle?.id ?? null}
          currentVehicleLabel={vehicleTarget.vehicle
            ? `${vehicleTarget.vehicle.marque} ${vehicleTarget.vehicle.modele}${vehicleTarget.vehicle.annee ? ` · ${vehicleTarget.vehicle.annee}` : ''}`
            : null}
          durationDays={vehicleTarget.duration_days}
          onClose={() => setVehicleTarget(null)}
          onSaved={(result) => {
            const j = result as { rental?: {
              id: string; rental_vehicle_id: string
              total_rental_amount: number | string; deposit_amount: number | string; duration_days: number | string
              rental_vehicle:
                | { marque: string; modele: string; annee: number | null; immatriculation: string }
                | { marque: string; modele: string; annee: number | null; immatriculation: string }[]
                | null
            } }
            const rr = j?.rental
            if (!rr) { setVehicleTarget(null); return }
            const embed = Array.isArray(rr.rental_vehicle) ? rr.rental_vehicle[0] : rr.rental_vehicle
            setRows((prev) => prev.map((row) => (row.id === rr.id
              ? {
                  ...row,
                  vehicle: embed
                    ? { id: rr.rental_vehicle_id, marque: embed.marque, modele: embed.modele, annee: embed.annee ?? null, immatriculation: embed.immatriculation }
                    : row.vehicle,
                  total_rental_amount: toNum(rr.total_rental_amount),
                  deposit_amount:      toNum(rr.deposit_amount),
                  duration_days:       toNum(rr.duration_days),
                }
              : row)))
            setVehicleTarget(null)
          }}
        />
      )}
    </div>
  )
}

function Th({ children, end }: { children: React.ReactNode; end?: boolean }) {
  return <th className={'px-4 py-2.5 font-semibold ' + (end ? 'text-end' : 'text-start')}>{children}</th>
}

// Soft-delete ("corbeille") confirmation. Mirrors CancelDialog's modal shell
// with a red destructive confirm. Recovery is DB-only — there's no restore UI.
function TrashDialog({
  count, busy, onClose, onConfirm,
}: {
  count: number
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div
      onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mettre à la corbeille"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Mettre à la corbeille ?</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {count} élément{count > 1 ? 's' : ''} seron{count > 1 ? 't' : 'a'} retiré{count > 1 ? 's' : ''} de la liste.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#e11d48' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

function RowActions({
  row, busy, canFin, onTransition, onReserve, onPickup, onReport, onCancel,
}: {
  row: ContractRow
  busy: boolean
  canFin: boolean
  onTransition: (row: ContractRow, status: ContractTransition) => void
  onReserve: () => void
  onPickup: () => void
  onReport: () => void
  onCancel: () => void
}) {
  const s = row.status
  // Chantier 1: any "À-confirmer" sub-state can be reserved (deposit) or
  // reported (new dates). Reprogrammer is gone — reporter→confirmed goes
  // through /reserve like any other À-confirmer.
  const isPending    = isContractPendingStatus(s)                                 // draft / tentative_X / reporter
  const canReserve   = isPending && canFin                                        // → confirmed via /reserve (owner/manager/closer/super_admin)
  const canPickup    = s === 'confirmed'                                          // → active   via /pickup
  const canComplete  = s === 'active' || s === 'overdue'                          // → completed (PATCH)
  const canReporter  = isPending                                                  // → reporter via /report (new dates)
  const canCancel    = s !== 'completed' && s !== 'cancelled'                     // → cancelled (PATCH)

  if (!canReserve && !canPickup && !canComplete && !canReporter && !canCancel) {
    return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {busy && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />}
      {canReserve && (
        <ActionBtn onClick={onReserve} disabled={busy} tone="primary" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
          {RENTAL_ACTION_RESERVE}
        </ActionBtn>
      )}
      {canPickup && (
        <ActionBtn onClick={onPickup} disabled={busy} tone="primary" icon={<CarIcon className="w-3.5 h-3.5" />}>
          {RENTAL_ACTION_PICKUP}
        </ActionBtn>
      )}
      {canComplete && (
        <ActionBtn onClick={() => onTransition(row, 'completed')} disabled={busy} tone="primary" icon={<Flag className="w-3.5 h-3.5" />}>
          Terminer
        </ActionBtn>
      )}
      {canReporter && (
        <ActionBtn onClick={onReport} disabled={busy} tone="neutral" icon={<CalendarClock className="w-3.5 h-3.5" />}>
          Reporter
        </ActionBtn>
      )}
      {canCancel && (
        <ActionBtn onClick={onCancel} disabled={busy} tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>
          Annuler
        </ActionBtn>
      )}
    </div>
  )
}

function ActionBtn({
  children, onClick, disabled, tone, icon,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone: 'primary' | 'danger' | 'neutral'
  icon: React.ReactNode
}) {
  const style =
    tone === 'primary' ? { background: 'var(--accent-subtle)', color: 'var(--accent)' } :
    tone === 'danger'  ? { background: 'rgba(244,63,94,0.12)', color: '#fb7185' } :
                         { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 transition-opacity"
      style={style}
    >
      {icon}{children}
    </button>
  )
}

function CancelDialog({
  row, busy, onClose, onConfirm,
}: {
  row: ContractRow
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Annuler le contrat"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glass)' }}
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Annuler le contrat</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <bdi>{row.contract_number ?? 'Ce contrat'}</bdi> sera marqué « {rentalStatusLabel('cancelled')} ». Cette action est définitive.
        </p>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mt-4 mb-1.5">Motif (optionnel)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Raison de l'annulation…"
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            Retour
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#e11d48' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Confirmer l&apos;annulation
          </button>
        </div>
      </div>
    </div>
  )
}
