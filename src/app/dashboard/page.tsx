'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Users, Car, CalendarClock, BadgeDollarSign, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole } from '@/lib/auth'
import { AlertBanner } from '@/components/alerts/alert-banner'
import LeadTemperatureWidget from '@/components/LeadTemperatureWidget'
import ReminderBanner from '@/components/ReminderBanner'
import Sparkline from '@/components/Sparkline'
import type { AppRole, Vehicle } from '@/lib/types'
import {
  LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS,
  type Lead, type Vente,
} from '@/lib/types'
import {
  format, startOfWeek, startOfMonth, startOfYear, subMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Helpers ─────────────────────────────────────────────────

function statusPill(status: Lead['status']) {
  const map: Record<Lead['status'], string> = {
    new:       'bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    contacted: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    qualified: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
    proposal:  'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    won:       'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    lost:      'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  }
  return map[status] ?? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
}

function sourcePill(source: Lead['source']) {
  const map: Record<Lead['source'], string> = {
    'walk-in':  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    phone:      'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
    website:    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    referral:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    social:     'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    facebook:   'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    instagram:  'bg-pink-50 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400',
    whatsapp:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    telephone:  'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
  }
  return map[source] ?? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
}

const PIPELINE_ORDER: Lead['status'][] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']

// Source palette for pie chart — matches design system
const SOURCE_COLORS: Record<string, string> = {
  whatsapp:  '#10b981',
  facebook:  '#3b82f6',
  instagram: '#ec4899',
  telephone: '#0ea5e9',
  phone:     '#0ea5e9',
  'walk-in': '#10b981',
  website:   '#71717a',
  referral:  '#8b5cf6',
  social:    '#f59e0b',
}

// ── Date filter ─────────────────────────────────────────────
type DateRange = 'all' | 'week' | 'month' | '3months' | 'year' | 'custom'

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDzd(n: number): string {
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

// ── Component ───────────────────────────────────────────────

export default function DashboardPage() {
  const [leads,    setLeads]    = useState<Lead[]>([])
  const [ventes,   setVentes]   = useState<Vente[]>([])
  const [vehiclesCount, setVehiclesCount] = useState(0)
  // Recent listings (FoCar-inspired horizontal scroll).
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading,  setLoading]  = useState(true)
  // Role gating — closer / prospecteur only see their own data;
  // prospecteur additionally has RDV / Ventes / CA cards hidden.
  // canSeeFinancials elsewhere is reserved for super_admin financials
  // across showrooms; here we mirror the same idea showroom-side.
  const [role,     setRole]     = useState<AppRole | null>(null)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('vous')

  // Default: Ce mois
  const [dateRange, setDateRange] = useState<DateRange>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo]     = useState('')

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

      // Leads: RLS already scopes the result for closer/prospecteur
      // (migration 32), so this single query is correct for every role.
      const leadsP = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })

      // Vehicles: full rows for the new "Derniers véhicules" listing
      // (owner/manager only — restricted roles never see the section).
      const vehiclesP = isRestricted
        ? Promise.resolve({ data: [] })
        : supabase
            .from('vehicles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10)

      // Ventes: hidden from prospecteur outright. For closer we still
      // fetch the page-wide set, but the rendering below filters to
      // ventes linked to their leads only (CA card is hidden either way
      // for closer per the financials gate).
      const ventesP = r?.role === 'prospecteur'
        ? Promise.resolve({ data: [] })
        : supabase.from('ventes').select('*').order('date_vente', { ascending: false })

      const [{ data: l }, { data: v }, { data: s }] = await Promise.all([leadsP, vehiclesP, ventesP])
      setLeads((l ?? []) as Lead[])
      const vRows = (v ?? []) as Vehicle[]
      setVehicles(vRows)
      setVehiclesCount(vRows.length)
      setVentes((s ?? []) as Vente[])
      setLoading(false)
    })()
  }, [])

  // Resolve [from, to] window from the dropdown.
  const activeWindow = useMemo<{ from: Date | null; to: Date | null }>(() => {
    const now = new Date()
    switch (dateRange) {
      case 'all':      return { from: null, to: null }
      case 'week':     return { from: startOfWeek(now, { weekStartsOn: 1 }), to: null }
      case 'month':    return { from: startOfMonth(now), to: null }
      case '3months':  return { from: subMonths(now, 3), to: null }
      case 'year':     return { from: startOfYear(now), to: null }
      case 'custom': {
        const from = appliedFrom ? new Date(appliedFrom + 'T00:00:00') : null
        const to   = appliedTo   ? new Date(appliedTo   + 'T23:59:59.999') : null
        return { from, to }
      }
    }
  }, [dateRange, appliedFrom, appliedTo])

  function inWindow(iso: string | null | undefined): boolean {
    if (!iso) return false
    const d = new Date(iso)
    if (activeWindow.from && d < activeWindow.from) return false
    if (activeWindow.to   && d > activeWindow.to)   return false
    return true
  }

  // ── 7-day buckets for KPI sparklines ──────────────────────
  // Always relative to "now" (independent of the page date filter)
  // so the small line readers as "last week" — consistent with the
  // FoCar reference's "growth from previous month" subtext.
  const last7Series = useMemo(() => {
    const days: { day: Date; leads: number; ventes: number; revenue: number; rdv: number }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      days.push({ day: d, leads: 0, ventes: 0, revenue: 0, rdv: 0 })
    }
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth() &&
      a.getDate()     === b.getDate()

    for (const l of leads) {
      const d = new Date(l.created_at)
      const slot = days.find((s) => sameDay(s.day, d))
      if (slot) slot.leads++
      if (l.suivi === 'rdv_planifie' && l.rdv_date) {
        const r = new Date(l.rdv_date)
        const rs = days.find((s) => sameDay(s.day, r))
        if (rs) rs.rdv++
      }
    }
    for (const v of ventes) {
      if (!v.date_vente) continue
      const d = new Date(v.date_vente)
      const slot = days.find((s) => sameDay(s.day, d))
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
  }, [leads, ventes])

  // Greeting copy.
  const todayLabel = useMemo(() =>
    format(new Date(), "EEEE d MMMM yyyy", { locale: fr })
      .replace(/^./, (c) => c.toUpperCase()),
  [])

  // ── Filtered datasets ─────────────────────────────────────
  const filteredLeads  = useMemo(() => leads.filter(l => inWindow(l.created_at)), [leads, activeWindow])

  // Closer: ventes scoped to ventes linked to their assigned leads.
  // Prospecteur: ventes is empty (fetched as []) anyway.
  // Owner / manager: every vente in the showroom.
  const myLeadIds = useMemo(() => {
    if (role !== 'closer' || !userId) return null
    return new Set(leads.filter(l => l.assigned_to === userId).map(l => l.id))
  }, [role, userId, leads])

  const filteredVentes = useMemo(() => {
    return ventes.filter(v => {
      if (myLeadIds && (!v.lead_id || !myLeadIds.has(v.lead_id))) return false
      return inWindow(v.date_vente)
    })
  }, [ventes, activeWindow, myLeadIds])

  const filteredRdv    = useMemo(
    () => leads.filter(l => l.suivi === 'rdv_planifie' && inWindow(l.rdv_date)),
    [leads, activeWindow]
  )

  // ── Pipeline bar data (filtered) ──────────────────────────
  const pipelineData = PIPELINE_ORDER.map(status => ({
    name: LEAD_STATUS_LABELS[status],
    total: filteredLeads.filter(l => l.status === status).length,
  }))

  // ── Source pie data (filtered) ────────────────────────────
  const sourceCounts = filteredLeads.reduce<Record<string, number>>((acc, l) => {
    acc[l.source] = (acc[l.source] ?? 0) + 1
    return acc
  }, {})
  const sourceTotal = Object.values(sourceCounts).reduce((a, b) => a + b, 0) || 1
  const sourceData = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, value]) => ({
      name: LEAD_SOURCE_LABELS[key as Lead['source']] ?? key,
      value,
      color: SOURCE_COLORS[key] ?? '#a1a1aa',
    }))

  // ── KPIs ──────────────────────────────────────────────────
  const totalLeads      = filteredLeads.length
  const vehiculesVendus = filteredVentes.length
  const chiffreAffaires = filteredVentes.reduce((acc, v) => acc + (v.prix_vente ?? 0), 0)
  const rdvPlanifies    = filteredRdv.length

  const kpis = [
    {
      label: 'Total leads',
      value: totalLeads.toString(),
      sub: leads.length ? `sur ${leads.length} au total` : '—',
      icon: Users,
      series: last7Series.leads,
      show: true,
    },
    {
      label: 'Véhicules vendus',
      value: vehiculesVendus.toString(),
      sub: `sur ${vehiclesCount} en stock`,
      icon: Car,
      series: last7Series.ventes,
      show: role !== 'prospecteur',
    },
    {
      label: 'Chiffre d\u2019affaires',
      value: formatDzd(chiffreAffaires),
      sub: 'DZD',
      icon: BadgeDollarSign,
      series: last7Series.revenue,
      show: role === 'owner' || role === 'manager' || role === 'super_admin' || role === 'commercial' || role == null,
    },
    {
      label: 'RDV planifiés',
      value: rdvPlanifies.toString(),
      sub: 'sur la période',
      icon: CalendarClock,
      series: last7Series.rdv,
      show: role !== 'prospecteur',
    },
  ].filter((k) => k.show)

  // Sales objective — share of "won" leads in the filtered window.
  const wonInWindow = filteredLeads.filter(l => l.status === 'won').length
  const salesPct    = filteredLeads.length ? Math.round((wonInWindow / filteredLeads.length) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
          <p className="text-zinc-500 text-sm">Chargement du tableau de bord…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-10 pt-6 max-w-7xl space-y-8 pb-12">
      {/* Greeting — top of the dashboard, FoCar-inspired. */}
      <div className="flex flex-col gap-1 animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Bonjour, <span className="text-emerald-600 dark:text-emerald-400">{userName}</span> 👋
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{todayLabel}</p>
      </div>

      {/* Header row: live insights pill + period filter */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 dark:text-emerald-400">
            Live Insights · {format(new Date(), "EEEE d MMMM", { locale: fr })}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 shrink-0">
              Période
            </span>
            <select
              value={dateRange}
              onChange={(e) => {
                const v = e.target.value as DateRange
                setDateRange(v)
                if (v === 'custom' && !customFrom && !customTo) {
                  const today = toDateInput(new Date())
                  setCustomFrom(today)
                  setCustomTo(today)
                }
                if (v !== 'custom') {
                  setAppliedFrom('')
                  setAppliedTo('')
                }
              }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
            >
              <option value="all">Tout</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="3months">3 derniers mois</option>
              <option value="year">Cette année</option>
              <option value="custom">Personnalisé</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Du</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
              />
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">au</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setAppliedFrom(customFrom)
                  setAppliedTo(customTo)
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-colors"
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Red alert banner (leads ignored > 48h) — wrapped to match design */}
      <AlertBanner />

      {/* migration_34 — reminder / escalation banner. Hidden when 0. */}
      <ReminderBanner role={role} userId={userId} />

      {/* Lead temperature widget — chaud/tiède/froid distribution. */}
      <LeadTemperatureWidget />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              style={{ animationDelay: `${i * 80}ms` }}
              className="kpi-card glass-card rounded-2xl p-5 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_-12px_var(--accent-glow)] animate-fade-in"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400 font-bold">{kpi.label}</p>
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white leading-none tracking-tight break-all tabular-nums">
                  {kpi.value}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 font-medium">{kpi.sub}</p>
              </div>
              <div className="-mx-1">
                <Sparkline
                  values={kpi.series}
                  width={200}
                  height={36}
                  stroke="#10b981"
                  fill="rgba(16,185,129,0.16)"
                  className="w-full h-auto"
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Pipeline + Sources + Objectif */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Pipeline bar chart — 8 cols */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="md:col-span-8 rounded-[2.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-8 shadow-sm"
        >
          <h2 className="text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-white mb-6">Pipeline commercial</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipelineData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(161,161,170,0.18)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }}
                axisLine={false} tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid rgba(63,63,70,0.5)', background: '#18181b', fontSize: 11, color: '#fafafa', fontWeight: 600 }}
                cursor={{ fill: 'rgba(16,185,129,0.10)' }}
              />
              <Bar dataKey="total" name="Prospects" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Right column: Sources pie + Objectif */}
        <div className="md:col-span-4 space-y-6">
          {/* Sources pie */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="rounded-[2.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-8 shadow-sm"
          >
            <h4 className="text-sm font-black uppercase tracking-tighter text-zinc-900 dark:text-white mb-6">Sources Leads</h4>
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceData} innerRadius={48} outerRadius={70} paddingAngle={4} dataKey="value">
                    {sourceData.map((entry, index) => <Cell key={index} fill={entry.color} stroke="none" />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(63,63,70,0.5)', borderRadius: 12 }}
                    itemStyle={{ color: '#fafafa', fontSize: 11, fontWeight: 600 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {sourceData.length === 0 && (
                <p className="text-xs text-zinc-500 text-center">Aucune source enregistrée.</p>
              )}
              {sourceData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{item.name}</span>
                  </div>
                  <span className="text-xs font-black text-zinc-900 dark:text-white">
                    {Math.round((item.value / sourceTotal) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Objectif card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-[2.5rem] bg-emerald-600 text-white p-8 shadow-2xl shadow-emerald-600/20 relative overflow-hidden group"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 block mb-4">Objectif Ventes</span>
            <div className="text-6xl font-black tracking-tighter mb-4 leading-none">{salesPct}%</div>
            <p className="text-[11px] font-bold opacity-80 mb-5">
              {wonInWindow} vente{wonInWindow > 1 ? 's' : ''} sur {filteredLeads.length} prospect{filteredLeads.length > 1 ? 's' : ''}
            </p>
            <a
              href="/dashboard/prospects"
              className="block w-full text-center h-11 leading-[2.75rem] bg-white text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
            >
              Voir le pipeline
            </a>
            <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
          </motion.div>
        </div>
      </div>

      {/* ── Derniers véhicules — horizontal scroll (FoCar-style) ──── */}
      {vehicles.length > 0 && (
        <section className="space-y-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
              Derniers véhicules
            </h2>
            <a
              href="/dashboard/vehicules"
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 inline-flex items-center gap-1"
            >
              Voir tout <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-2 px-2">
            {vehicles.slice(0, 8).map((v) => {
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
                  className="glass-card snap-start shrink-0 w-[240px] rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_10px_40px_-12px_var(--accent-glow)] transition-all duration-300"
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-emerald-100 via-emerald-50 to-white dark:from-emerald-500/15 dark:via-emerald-500/5 dark:to-zinc-900 relative overflow-hidden">
                    {v.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.image_url} alt={`${v.brand} ${v.model}`} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Car className="w-10 h-10 text-emerald-400/60 dark:text-emerald-400/40" />
                      </div>
                    )}
                    <span className={'absolute top-2 right-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ' + statusCls}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      {v.brand} {v.model}{v.year ? ` · ${v.year}` : ''}
                    </p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {v.price_dzd != null ? formatDzd(v.price_dzd) + ' DZD' : 'Prix sur demande'}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {[v.type_moteur, v.color, v.kilometrage != null ? formatDzd(v.kilometrage) + ' km' : null]
                        .filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Véhicules les plus vendus (table) ──────────────────────── */}
      {ventes.length > 0 && (role === 'owner' || role === 'manager' || role === 'super_admin') && (
        <section className="glass-card rounded-2xl overflow-hidden animate-fade-in" style={{ animationDelay: '380ms' }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-white/5">
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
              Véhicules les plus vendus
            </h2>
            <a
              href="/dashboard/ventes"
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 inline-flex items-center gap-1"
            >
              Voir tout <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-zinc-50/60 dark:bg-white/[0.02]">
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Modèle</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Client</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Date</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest text-zinc-500 font-bold text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                {ventes.slice(0, 5).map((v) => (
                  <tr key={v.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3 font-medium text-zinc-900 dark:text-white truncate max-w-[220px]">
                      {v.vehicle_name ?? '—'}
                      {v.vehicle_reference && (
                        <span className="ml-2 text-[10px] font-mono text-zinc-500">{v.vehicle_reference}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300 truncate max-w-[180px]">{v.client_name ?? '—'}</td>
                    <td className="px-6 py-3 text-xs text-zinc-500">
                      {v.date_vente ? format(new Date(v.date_vente), 'd MMM yyyy', { locale: fr }) : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {v.prix_vente != null ? formatDzd(v.prix_vente) + ' DZD' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent leads — also filtered by period */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="rounded-[2.5rem] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden shadow-sm"
      >
        <div className="flex items-center justify-between px-8 py-6">
          <h2 className="text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-white">Derniers prospects</h2>
          <a
            href="/dashboard/leads"
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
          >
            Voir tout <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-y border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
                <th className="px-8 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Nom</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Wilaya</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Source</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Statut</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.slice(0, 6).map((lead) => (
                <tr key={lead.id} className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="px-8 py-4 font-bold text-zinc-900 dark:text-white">
                    <span dir="auto">{lead.full_name}</span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 text-xs">{lead.wilaya ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${sourcePill(lead.source)}`}>
                      {LEAD_SOURCE_LABELS[lead.source]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusPill(lead.status)}`}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 text-xs font-medium">
                    {format(new Date(lead.created_at), 'dd/MM/yyyy', { locale: fr })}
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Aucun prospect sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
