// ─────────────────────────────────────────────────────────────────────
// /dashboard/location — rental hub.
// ─────────────────────────────────────────────────────────────────────
// Server component: live KPIs (contrats actifs / véhicules disponibles /
// revenus du mois / remises-retours du jour) + CTAs + the live Agenda
// widget. Scoped by role (owner/manager/super_admin = all showroom; closer
// = assigned_to self). Revenue is owner/manager/super_admin only. Africa/
// Algiers tz. Gated by middleware (ROUTE_ACL) + RLS.
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Calendar, FileText, KeyRound, Car, BadgeDollarSign, ArrowRight } from 'lucide-react'
import RentalAgendaWidget from '@/components/rental/RentalAgendaWidget'
import {
  computeRentalAgenda, algiersToday, addDaysISO,
  type RentalAgenda,
} from '@/lib/rental/agenda'
import { toNum, formatDZD } from '@/components/rental/booking/types'
import { RENT_PAYMENT_TYPE, EXTRA_FEE_TYPES, REFUND_PAYMENT_TYPE } from '@/lib/rental/payments'

type HubKpis = {
  activeContracts: number
  fleetTotal:      number
  fleetAvailable:  number
  todayCount:      number
  monthRevenue:    number | null   // null → not allowed to see revenue
}

type HubData = {
  agenda: RentalAgenda
  today: string
  tomorrow: string
  kpis: HubKpis
  canFin: boolean
}

async function loadHub(): Promise<HubData> {
  const today = algiersToday()
  const tomorrow = addDaysISO(today, 1)
  const empty: HubData = {
    agenda: { pickups: [], returns: [], overdue: [] }, today, tomorrow,
    kpis: { activeContracts: 0, fleetTotal: 0, fleetAvailable: 0, todayCount: 0, monthRevenue: null },
    canFin: false,
  }

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return empty

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return cookieStore.getAll().map(({ name, value }) => ({ name, value })) },
      setAll() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const { data: roleRow } = await supabase
    .from('user_roles').select('role, showroom_id').eq('user_id', user.id).maybeSingle()
  const role = (roleRow?.role as string | undefined) ?? ''
  const showroomId = (roleRow?.showroom_id as string | null) ?? null
  const isCloser = role === 'closer'
  const canFin = role === 'owner' || role === 'manager' || role === 'super_admin'

  const agenda = await computeRentalAgenda(supabase, { showroomId, role, userId: user.id })

  // 1) Contrats actifs — confirmed/active/overdue (closer → own).
  let cq = supabase.from('rentals').select('id', { count: 'exact', head: true })
    .in('status', ['confirmed', 'active', 'overdue'])
  if (showroomId) cq = cq.eq('showroom_id', showroomId)
  if (isCloser) cq = cq.eq('assigned_to', user.id)
  const { count: activeContracts } = await cq

  // 2) Véhicules disponibles — active fleet minus those rented today.
  let fq = supabase.from('rental_vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true)
  if (showroomId) fq = fq.eq('showroom_id', showroomId)
  const { count: fleetTotal } = await fq

  let bq = supabase.from('rentals').select('rental_vehicle_id')
    .in('status', ['confirmed', 'active', 'overdue'])
    .lte('start_date', today).gte('end_date', today)
  if (showroomId) bq = bq.eq('showroom_id', showroomId)
  const { data: busy } = await bq
  const rented = new Set((busy ?? []).map((r) => (r as { rental_vehicle_id: string }).rental_vehicle_id))
  const fleetAvailable = Math.max(0, (fleetTotal ?? 0) - rented.size)

  // 4) Remises + retours du jour (from the agenda, today only).
  const todayCount =
    agenda.pickups.filter((p) => p.date === today).length +
    agenda.returns.filter((r) => r.date === today).length

  // 3) Revenus du mois (Africa/Algiers) — owner/manager/super_admin only.
  // Revenue = rental_payment + extra fees − refunds; deposit excluded.
  let monthRevenue: number | null = null
  if (canFin) {
    const monthStartUtc = new Date(`${today.slice(0, 7)}-01T00:00:00+01:00`).toISOString()
    const { data: pays } = await supabase
      .from('rental_payments')
      .select('type, amount')
      .gte('created_at', monthStartUtc)
      .in('type', [RENT_PAYMENT_TYPE, ...EXTRA_FEE_TYPES, REFUND_PAYMENT_TYPE])
    monthRevenue = (pays ?? []).reduce((acc, p) => {
      const amt = toNum((p as { amount: string | number | null }).amount)
      return (p as { type: string }).type === REFUND_PAYMENT_TYPE ? acc - amt : acc + amt
    }, 0)
  }

  return {
    agenda, today, tomorrow, canFin,
    kpis: {
      activeContracts: activeContracts ?? 0,
      fleetTotal: fleetTotal ?? 0,
      fleetAvailable,
      todayCount,
      monthRevenue,
    },
  }
}

export default async function RentalDashboardPage() {
  const { agenda, today, tomorrow, kpis, canFin } = await loadHub()

  const cards: { label: string; value: string; sub: string; icon: typeof Calendar }[] = [
    { label: 'Contrats actifs',     value: String(kpis.activeContracts),                     sub: 'en cours + réservés', icon: FileText },
    { label: 'Véhicules disponibles', value: `${kpis.fleetAvailable} / ${kpis.fleetTotal}`,  sub: 'disponibles / flotte', icon: Car },
    ...(canFin && kpis.monthRevenue != null
      ? [{ label: 'Revenus du mois', value: formatDZD(kpis.monthRevenue), sub: 'encaissé ce mois', icon: BadgeDollarSign }]
      : []),
    { label: "Remises / retours aujourd'hui", value: String(kpis.todayCount), sub: 'remises + retours', icon: Calendar },
  ]

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
          <KeyRound className="w-3.5 h-3.5" />
          Module Location
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Tableau de bord — Location
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Gérez votre flotte, vos contrats, vos demandes et vos encaissements.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {cards.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="kpi-card lift-on-hover p-5 flex flex-col gap-4 animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-zinc-500 dark:text-zinc-400">
                  {s.label}
                </p>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-white break-all">
                  {s.value}
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{s.sub}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/location/contrats/nouveau"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white hover:-translate-y-0.5 transition-transform"
          style={{
            background: 'var(--accent)',
            boxShadow: '0 8px 22px -10px var(--accent-glow)',
          }}
        >
          ➕ Nouvelle location
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <Link
          href="/dashboard/location/prospects"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-medium glass-card hover:-translate-y-0.5 transition-transform"
        >
          📥 Demandes de location
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <Link
          href="/dashboard/location/contrats"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-medium glass-card hover:-translate-y-0.5 transition-transform"
        >
          📄 Voir les contrats
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <Link
          href="/dashboard/location/vehicules"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-medium glass-card hover:-translate-y-0.5 transition-transform"
        >
          📅 Voir la flotte
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>

      {/* Agenda — live pickups / returns / overdue */}
      <RentalAgendaWidget agenda={agenda} today={today} tomorrow={tomorrow} />

      {/* What's live */}
      <div
        className="glass-card p-6 rounded-2xl"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          Disponible dès maintenant
        </h2>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          {[
            'Flotte de location (créer / modifier / supprimer)',
            'Tarifs & règles de location',
            'Contrats de location (création, signature, paiements)',
            'Demandes de location (catalogue public → prospects)',
            'Agenda des remises & retours',
            'Permissions par rôle (Owner / Manager / Closer)',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {f}
            </li>
          ))}
        </ul>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Bientôt
        </p>
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-zinc-400 dark:text-zinc-500">
          {[
            'Calendrier (vue planning)',
            'Inspections (état des lieux entrée / sortie)',
            'Contrat PDF imprimable',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
