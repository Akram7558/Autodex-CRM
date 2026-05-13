'use client'
// ─────────────────────────────────────────────────────────────────────
// Showroom owner dashboard — FoCar-inspired premium dark redesign.
// ─────────────────────────────────────────────────────────────────────
// Full visual rewrite. Functional surface preserved 1:1:
//   • Role gating (closer / prospecteur hide / scope cards)
//   • Data scoping via RLS — service-role is not used here
//   • Reminder banner, temperature widget unchanged in behaviour
// Visuals are entirely new: glass + emerald gradient KPI cards with
// inline SVG sparklines, emerald-gradient area chart, donut for lead
// sources, horizontally-scrolled vehicle listings, top sales table.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, Tooltip,
  XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  Users, Car, CalendarDays, Banknote,
  ArrowUpRight, ArrowDownRight, Sparkles, Activity,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole } from '@/lib/auth'
import { AlertBanner } from '@/components/alerts/alert-banner'
import LeadTemperatureWidget from '@/components/LeadTemperatureWidget'
import ReminderBanner from '@/components/ReminderBanner'
import Sparkline from '@/components/Sparkline'
import type { AppRole, Vehicle, Lead, Vente, LeadSource } from '@/lib/types'
import { LEAD_SOURCE_LABELS } from '@/lib/types'
import { format, startOfMonth, subMonths, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Helpers ───────────────────────────────────────────────────────

// French-style thousand separators with regular spaces (NBSP/NNBSP
// the Intl API emits don't always render consistently). "10850000" →
// "10 850 000".
function formatDzd(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(n)
    .replace(/ | /g, ' ')
}

// French-style: lowercase day with first letter capitalised.
function frenchDateLong(d: Date): string {
  const s = format(d, "EEEE d MMMM yyyy", { locale: fr })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Compute a % change between this-period and previous-period count.
function pctDelta(curr: number, prev: number): number | null {
  if (prev <= 0) return curr > 0 ? null : 0
  return Math.round(((curr - prev) / prev) * 100)
}

// Per-source color, anchored on the emerald family for the dominant
// channels (showroom / WhatsApp) and supporting hues for the rest.
const SOURCE_COLOR_MAP: Record<LeadSource | 'other', string> = {
  whatsapp:   '#10b981',
  'walk-in':  '#34d399',
  referral:   '#6ee7b7',
  facebook:   '#0ea5e9',
  instagram:  '#a855f7',
  telephone:  '#22d3ee',
  phone:      '#22d3ee',
  website:    '#fbbf24',
  social:     '#f97316',
  other:      '#64748b',
}

// ─── Sales chart bucket helpers ────────────────────────────────────

type ChartRange = 'week' | 'month' | 'year'

function bucketsForRange(range: ChartRange): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = []
  const now = new Date()
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = subDays(now, i)
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end   = new Date(d); end.setHours(23, 59, 59, 999)
      out.push({ label: format(d, 'EEE', { locale: fr }).replace('.', ''), start, end })
    }
  } else if (range === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i)
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end   = new Date(d); end.setHours(23, 59, 59, 999)
      out.push({ label: format(d, 'd', { locale: fr }), start, end })
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i)
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
      out.push({ label: format(d, 'LLL', { locale: fr }).replace('.', ''), start, end })
    }
  }
  return out
}

// ─── Component ─────────────────────────────────────────────────────

export default function DashboardPage() {
  // ── Data ────────────────────────────────────────────────────────
  const [leads,         setLeads]    = useState<Lead[]>([])
  const [ventes,        setVentes]   = useState<Vente[]>([])
  const [vehicles,      setVehicles] = useState<Vehicle[]>([])
  const [vehiclesCount, setVehiclesCount] = useState(0)
  const [loading,       setLoading]  = useState(true)

  // ── Role + identity (preserved from previous build) ─────────────
  const [role,   setRole]   = useState<AppRole | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('vous')

  const [chartRange, setChartRange] = useState<ChartRange>('month')

  useEffect(() => {
    (async () => {
      const r = await getCurrentUserRole()
      setRole(r?.role ?? null)
      setUserId(r?.userId ?? null)
      if (r?.email) {
        const local = r.email.split('@')[0].replace(/[._-]/g, ' ').trim()
        if (local) setUserName(local.charAt(0).toUpperCase() + local.slice(1))
      }
      const isRestricted = r?.role === 'closer' || r?.role === 'prospecteur'

      const leadsP = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
      const vehiclesP = isRestricted
        ? Promise.resolve({ data: [] })
        : supabase
            .from('vehicles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(12)
      const ventesP = r?.role === 'prospecteur'
        ? Promise.resolve({ data: [] })
        : supabase
            .from('ventes')
            .select('*')
            .order('date_vente', { ascending: false })
            .limit(50)

      const [{ data: l }, { data: v }, { data: s }] = await Promise.all([leadsP, vehiclesP, ventesP])
      setLeads((l ?? []) as Lead[])
      const vRows = (v ?? []) as Vehicle[]
      setVehicles(vRows)
      setVehiclesCount(vRows.length)
      setVentes((s ?? []) as Vente[])
      setLoading(false)
    })()
  }, [])

  // ── Window helpers (this month vs last month for deltas) ────────
  const now = useMemo(() => new Date(), [])
  const monthStart = useMemo(() => startOfMonth(now), [now])
  const prevMonthStart = useMemo(() => startOfMonth(subMonths(now, 1)), [now])
  const prevMonthEnd   = useMemo(() => {
    const d = new Date(monthStart); d.setMilliseconds(-1); return d
  }, [monthStart])

  const inThisMonth = (iso?: string | null) => iso != null && new Date(iso) >= monthStart
  const inLastMonth = (iso?: string | null) => {
    if (!iso) return false
    const d = new Date(iso)
    return d >= prevMonthStart && d <= prevMonthEnd
  }

  // Closer's ventes are scoped to their own leads; prospecteur sees none.
  const myLeadIds = useMemo(() => {
    if (role !== 'closer' || !userId) return null
    return new Set(leads.filter((l) => l.assigned_to === userId).map((l) => l.id))
  }, [role, userId, leads])

  const visibleVentes = useMemo(() => {
    if (role === 'prospecteur') return [] as Vente[]
    return ventes.filter((v) => {
      if (myLeadIds && (!v.lead_id || !myLeadIds.has(v.lead_id))) return false
      return true
    })
  }, [ventes, role, myLeadIds])

  // ── KPI numbers (current month) + previous-month deltas ─────────
  const totalLeads        = leads.filter((l) => inThisMonth(l.created_at)).length
  const totalLeadsPrev    = leads.filter((l) => inLastMonth(l.created_at)).length

  const vehiculesVendus   = visibleVentes.filter((v) => inThisMonth(v.date_vente)).length
  const ventesPrev        = visibleVentes.filter((v) => inLastMonth(v.date_vente)).length

  const chiffreAffaires   = visibleVentes
    .filter((v) => inThisMonth(v.date_vente))
    .reduce((acc, v) => acc + (v.prix_vente ?? 0), 0)
  const caPrev            = visibleVentes
    .filter((v) => inLastMonth(v.date_vente))
    .reduce((acc, v) => acc + (v.prix_vente ?? 0), 0)

  const rdvPlanifies      = leads.filter((l) =>
    l.suivi === 'rdv_planifie' && l.rdv_date && new Date(l.rdv_date) >= now,
  ).length
  const rdvLastMonthCount = leads.filter((l) => l.suivi === 'rdv_planifie' && inLastMonth(l.rdv_date)).length

  // ── Last 7 days series for sparklines ───────────────────────────
  const last7 = useMemo(() => {
    const days: { day: Date; leads: number; ventes: number; revenue: number; rdv: number }[] = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      days.push({ day: d, leads: 0, ventes: 0, revenue: 0, rdv: 0 })
    }
    const same = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth() &&
      a.getDate()     === b.getDate()
    for (const l of leads) {
      const d = new Date(l.created_at)
      const slot = days.find((s) => same(s.day, d))
      if (slot) slot.leads++
      if (l.suivi === 'rdv_planifie' && l.rdv_date) {
        const rd = new Date(l.rdv_date)
        const rs = days.find((s) => same(s.day, rd))
        if (rs) rs.rdv++
      }
    }
    for (const v of visibleVentes) {
      if (!v.date_vente) continue
      const d = new Date(v.date_vente)
      const slot = days.find((s) => same(s.day, d))
      if (slot) {
        slot.ventes++
        slot.revenue += v.prix_vente ?? 0
      }
    }
    return {
      leads:   days.map((d) => d.leads),
      ventes:  days.map((d) => d.ventes),
      revenue: days.map((d) => d.revenue),
      rdv:     days.map((d) => d.rdv),
    }
  }, [leads, visibleVentes])

  // ── Sales chart (week / month / year) ───────────────────────────
  const salesSeries = useMemo(() => {
    const buckets = bucketsForRange(chartRange)
    return buckets.map((b) => {
      const revenue = visibleVentes
        .filter((v) => v.date_vente && new Date(v.date_vente) >= b.start && new Date(v.date_vente) <= b.end)
        .reduce((acc, v) => acc + (v.prix_vente ?? 0), 0)
      return { name: b.label, value: revenue }
    })
  }, [visibleVentes, chartRange])

  // ── Sources donut ───────────────────────────────────────────────
  const sourceData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of leads.filter((l) => inThisMonth(l.created_at))) {
      counts[l.source] = (counts[l.source] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 0
    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, value]) => ({
        name:  LEAD_SOURCE_LABELS[key as LeadSource] ?? key,
        value,
        color: SOURCE_COLOR_MAP[key as LeadSource] ?? SOURCE_COLOR_MAP.other,
      }))
    return { entries, total }
  }, [leads, monthStart])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Role gating ─────────────────────────────────────────────────
  const showFinancials  = role === 'owner' || role === 'manager' || role === 'super_admin' || role === 'commercial' || role == null
  const showRdv         = role !== 'prospecteur'
  const showVentesCount = role !== 'prospecteur'
  const showListings    = role === 'owner' || role === 'manager' || role === 'super_admin'

  // ── KPI definition list ─────────────────────────────────────────
  const kpis: Array<{
    label: string
    value: string
    sub:   string
    icon:  typeof Users
    series: number[]
    delta: number | null
    show:  boolean
  }> = [
    {
      label: 'Total leads',
      value: totalLeads.toString(),
      sub:   `${leads.length} au total`,
      icon:  Users,
      series: last7.leads,
      delta:  pctDelta(totalLeads, totalLeadsPrev),
      show:   true,
    },
    {
      label: 'Véhicules vendus',
      value: vehiculesVendus.toString(),
      sub:   `sur ${vehiclesCount} en stock`,
      icon:  Car,
      series: last7.ventes,
      delta:  pctDelta(vehiculesVendus, ventesPrev),
      show:   showVentesCount,
    },
    {
      label: "Chiffre d'affaires",
      value: formatDzd(chiffreAffaires) + ' DZD',
      sub:   'ce mois',
      icon:  Banknote,
      series: last7.revenue,
      delta:  pctDelta(chiffreAffaires, caPrev),
      show:   showFinancials,
    },
    {
      label: 'RDV planifiés',
      value: rdvPlanifies.toString(),
      sub:   'à venir',
      icon:  CalendarDays,
      series: last7.rdv,
      delta:  pctDelta(rdvPlanifies, rdvLastMonthCount),
      show:   showRdv,
    },
  ].filter((k) => k.show)

  // ── Skeletons while loading ─────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div className="h-9 w-64 rounded-lg bg-[var(--bg-elevated)] animate-shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card h-[170px] animate-shimmer" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-8 glass-card h-[360px] animate-shimmer" />
          <div className="md:col-span-4 glass-card h-[360px] animate-shimmer" />
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Reminder banner — pinned at top when leads need attention. */}
      <ReminderBanner role={role} userId={userId} />

      {/* Alert banner (leads ignored > 48h) — kept from previous build. */}
      <AlertBanner />

      {/* ── Greeting ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Bonjour, <span className="text-emerald-500 dark:text-emerald-400">{userName}</span>{' '}
          <span className="inline-block animate-pulse-dot">👋</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">{frenchDateLong(now)}</p>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          const deltaPositive = (kpi.delta ?? 0) >= 0
          const DeltaIcon = deltaPositive ? ArrowUpRight : ArrowDownRight
          return (
            <div
              key={kpi.label}
              className={`kpi-card lift-on-hover p-5 flex flex-col gap-4 animate-fade-in animate-delay-${Math.min(i + 1, 5)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--text-secondary)]">
                  {kpi.label}
                </p>
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] ring-1 ring-emerald-500/25 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <div>
                <p className="text-3xl md:text-[34px] font-bold leading-none tracking-tight tabular-nums text-[var(--text-primary)] break-all">
                  {kpi.value}
                </p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{kpi.sub}</p>
              </div>

              <div className="flex items-center justify-between gap-2">
                {kpi.delta != null ? (
                  <span className={
                    'inline-flex items-center gap-1 text-xs font-semibold ' +
                    (deltaPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400')
                  }>
                    <DeltaIcon className="w-3.5 h-3.5" />
                    {deltaPositive ? '+' : ''}{kpi.delta}%
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-secondary)]">—</span>
                )}
                <Sparkline
                  values={kpi.series}
                  width={96}
                  height={32}
                  stroke="#10b981"
                  fill="rgba(16,185,129,0.18)"
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Charts row: sales (60%) + sources (40%) ────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Sales chart */}
        <div className="md:col-span-8 glass-card p-6 animate-fade-in animate-delay-2">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">
                Statistiques des ventes
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {chartRange === 'week'  && '7 derniers jours'}
                {chartRange === 'month' && '30 derniers jours'}
                {chartRange === 'year'  && '12 derniers mois'}
              </p>
            </div>
            <div className="inline-flex rounded-lg p-1 bg-[var(--bg-elevated)] border border-[var(--border)]">
              {(['week', 'month', 'year'] as ChartRange[]).map((r) => {
                const active = chartRange === r
                const label = r === 'week' ? 'Semaine' : r === 'month' ? 'Mois' : 'Année'
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setChartRange(r)}
                    className={
                      'px-3 py-1 rounded-md text-xs font-semibold transition-colors ' +
                      (active
                        ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {salesSeries.every((s) => s.value === 0) ? (
            <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-center">
              <Activity className="w-8 h-8 text-[var(--text-secondary)] opacity-50" />
              <p className="text-sm text-[var(--text-secondary)]">Aucune vente sur cette période.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={salesSeries} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false} width={48}
                  tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={{
                    background:   'rgba(12,12,16,0.92)',
                    border:       '1px solid rgba(16,185,129,0.3)',
                    borderRadius: 10,
                    fontSize:     12,
                    color:        '#f1f5f9',
                    boxShadow:    '0 10px 40px -10px rgba(16,185,129,0.3)',
                  }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                  formatter={(value) => [formatDzd(Number(value)) + ' DZD', 'Ventes']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2.4}
                  fill="url(#salesGradient)"
                  activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sources donut */}
        <div className="md:col-span-4 glass-card p-6 animate-fade-in animate-delay-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">Sources des leads</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Ce mois-ci</p>
            </div>
            <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>

          <div className="relative h-[200px]">
            {sourceData.entries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <Sparkles className="w-7 h-7 text-[var(--text-secondary)] opacity-50" />
                <p className="text-sm text-[var(--text-secondary)]">Aucun lead ce mois.</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceData.entries} innerRadius={62} outerRadius={88} paddingAngle={3} dataKey="value">
                      {sourceData.entries.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background:   'rgba(12,12,16,0.92)',
                        border:       '1px solid rgba(16,185,129,0.3)',
                        borderRadius: 10,
                        fontSize:     12,
                        color:        '#f1f5f9',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center number overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-semibold">
                    Total
                  </p>
                  <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">
                    {sourceData.total}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Legend */}
          {sourceData.entries.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">
              {sourceData.entries.map((e) => (
                <li key={e.name} className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
                  <span className="text-xs text-[var(--text-secondary)] truncate flex-1">{e.name}</span>
                  <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">{e.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Derniers véhicules — horizontal scroll ─────────────── */}
      {showListings && (
        <section className="space-y-4 animate-fade-in animate-delay-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">Derniers véhicules</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Ajoutés récemment au stock</p>
            </div>
            <a
              href="/dashboard/vehicules"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
            >
              Voir tout <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {vehicles.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Car className="w-9 h-9 mx-auto text-[var(--text-secondary)] opacity-50" />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">Aucun véhicule au stock pour le moment.</p>
              <a
                href="/dashboard/vehicules"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
              >
                Ajouter un véhicule <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
          <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-2 px-2">
            {vehicles.slice(0, 12).map((v) => {
              const statusCls =
                v.status === 'available'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
                  : v.status === 'reserved'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30'
              const statusLabel = v.status === 'available' ? 'Disponible'
                : v.status === 'reserved' ? 'Réservé' : 'Vendu'
              return (
                <a
                  key={v.id}
                  href="/dashboard/vehicules"
                  className="snap-start shrink-0 w-[240px] rounded-2xl overflow-hidden glass-card lift-on-hover"
                >
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent">
                    {v.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.image_url} alt={`${v.brand} ${v.model}`} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Car className="w-10 h-10 text-emerald-400/60" />
                      </div>
                    )}
                    <span className={'absolute top-2 right-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ' + statusCls}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {v.brand} {v.model}{v.year ? ` · ${v.year}` : ''}
                    </p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {v.price_dzd != null ? formatDzd(v.price_dzd) + ' DZD' : 'Prix sur demande'}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      {[
                        v.type_moteur,
                        v.color,
                        v.kilometrage != null ? formatDzd(v.kilometrage) + ' km' : null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
          )}
        </section>
      )}

      {/* ── Temperature widget (compact) ───────────────────────── */}
      <div className="animate-fade-in animate-delay-4">
        <LeadTemperatureWidget />
      </div>

      {/* ── Top selling table ──────────────────────────────────── */}
      {showListings && (
        <section className="glass-card overflow-hidden animate-fade-in animate-delay-5">
          <div className="flex items-center justify-between px-6 py-4 border-b glass-divider">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">Dernières ventes</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Les 5 plus récentes</p>
            </div>
            <a
              href="/dashboard/ventes"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
            >
              Voir tout <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          {visibleVentes.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Banknote className="w-9 h-9 mx-auto text-[var(--text-secondary)] opacity-50" />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">Aucune vente enregistrée pour le moment.</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-[var(--bg-elevated)]">
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-secondary)]">Véhicule</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-secondary)]">Client</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-secondary)]">Date</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-secondary)]">Statut</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-secondary)] text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {visibleVentes.slice(0, 5).map((v) => (
                  <tr key={v.id} className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-6 py-3 font-medium text-[var(--text-primary)] truncate max-w-[260px]">
                      {v.vehicle_name ?? '—'}
                      {v.vehicle_reference && (
                        <span className="ml-2 text-[10px] font-mono text-[var(--text-secondary)]">{v.vehicle_reference}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-[var(--text-secondary)] truncate max-w-[180px]">{v.client_name ?? '—'}</td>
                    <td className="px-6 py-3 text-xs text-[var(--text-secondary)]">
                      {v.date_vente ? format(new Date(v.date_vente), 'd MMM yyyy', { locale: fr }) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
                        Livré
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {v.prix_vente != null ? formatDzd(v.prix_vente) + ' DZD' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}
    </div>
  )
}

