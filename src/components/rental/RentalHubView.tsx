'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalHubView — self-fetching Location hub (client-fetch pattern).
// ─────────────────────────────────────────────────────────────────────
// Mirrors the contrats pilot (0435d4b) + prospects conversion (2c6fec8):
// the route shell commits instantly and this component loads its own data
// behind internal skeletons (KPI cards + agenda zone — header/CTAs stay
// live). Identity/role/showroom resolve client-side (getCurrentUserRole);
// every query runs on the browser supabase client and is row-scoped by RLS
// (the explicit .eq(showroom_id) mirrors the old server query for parity +
// defense-in-depth, NOT as the security boundary).
//
// computeRentalAgenda was ALREADY client-safe (it takes the supabase client
// as an argument and imports no server-only module — the notification bell
// already ships it in the client bundle), so it is called here as-is.
// RentalAgendaWidget stays a props-only component.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, FileText, KeyRound, Car, BadgeDollarSign, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole } from '@/lib/auth'
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

const EMPTY_KPIS: HubKpis = {
  activeContracts: 0, fleetTotal: 0, fleetAvailable: 0, todayCount: 0, monthRevenue: null,
}
const EMPTY_AGENDA: RentalAgenda = { pickups: [], returns: [], overdue: [] }

export default function RentalHubView() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [agenda, setAgenda] = useState<RentalAgenda>(EMPTY_AGENDA)
  const [kpis, setKpis] = useState<HubKpis>(EMPTY_KPIS)
  const [canFin, setCanFin] = useState(false)
  // Africa/Algiers "today"/"tomorrow" — pure date helpers, computed client-side.
  const [days, setDays] = useState<{ today: string; tomorrow: string }>(() => {
    const today = algiersToday()
    return { today, tomorrow: addDaysISO(today, 1) }
  })

  // ── Mount fetch (replaces the old server loadHub()) ─────────────────────
  // loading/loadError start in the right state on mount; the retry button
  // resets them before bumping reloadKey (no synchronous setState here).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const today = algiersToday()
      const tomorrow = addDaysISO(today, 1)
      if (!cancelled) setDays({ today, tomorrow })

      // Resolve identity/role/showroom client-side — the same mechanism the
      // sales Views use (supabase.auth.getUser() + user_roles).
      const me = await getCurrentUserRole()
      if (cancelled) return
      if (!me || (me.role !== 'owner' && me.role !== 'manager' && me.role !== 'closer' && me.role !== 'super_admin')) {
        // Middleware already gates this route; treat an unexpected/absent role
        // as an empty view rather than crashing.
        setAgenda(EMPTY_AGENDA); setKpis(EMPTY_KPIS); setCanFin(false); setLoading(false)
        return
      }
      const { userId, role, showroomId } = me
      const isCloser = role === 'closer'
      const fin = role === 'owner' || role === 'manager' || role === 'super_admin'

      const agendaData = await computeRentalAgenda(supabase, { showroomId, role: role ?? '', userId })
      if (cancelled) return

      // KPI reads — four independent aggregate queries, fired concurrently
      // (same queries/filters/scoping as the old server hub, verbatim).
      // Revenue stays gated to financial roles (closer excluded).
      const [activeContracts, fleetTotal, rentedToday, monthRevenue] = await Promise.all([
        // 1) Contrats actifs — confirmed/active/overdue (closer → own).
        (async (): Promise<number> => {
          let cq = supabase.from('rentals').select('id', { count: 'exact', head: true })
            .in('status', ['confirmed', 'active', 'overdue'])
          if (showroomId) cq = cq.eq('showroom_id', showroomId)
          if (isCloser) cq = cq.eq('assigned_to', userId)
          const { count } = await cq
          return count ?? 0
        })(),

        // 2a) Flotte active (total count).
        (async (): Promise<number> => {
          let fq = supabase.from('rental_vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true)
          if (showroomId) fq = fq.eq('showroom_id', showroomId)
          const { count } = await fq
          return count ?? 0
        })(),

        // 2b) Véhicules loués aujourd'hui (disponibles = flotte − loués).
        (async (): Promise<string[]> => {
          let bq = supabase.from('rentals').select('rental_vehicle_id')
            .in('status', ['confirmed', 'active', 'overdue'])
            .lte('start_date', today).gte('end_date', today)
          if (showroomId) bq = bq.eq('showroom_id', showroomId)
          const { data: busy } = await bq
          return (busy ?? []).map((r) => (r as { rental_vehicle_id: string }).rental_vehicle_id)
        })(),

        // 3) Revenus du mois (Africa/Algiers) — owner/manager/super_admin only.
        // Revenue = rental_payment + extra fees − refunds; deposit excluded.
        (async (): Promise<number | null> => {
          if (!fin) return null
          const monthStartUtc = new Date(`${today.slice(0, 7)}-01T00:00:00+01:00`).toISOString()
          const { data: pays } = await supabase
            .from('rental_payments')
            .select('type, amount')
            .gte('created_at', monthStartUtc)
            .in('type', [RENT_PAYMENT_TYPE, ...EXTRA_FEE_TYPES, REFUND_PAYMENT_TYPE])
          return (pays ?? []).reduce((acc, p) => {
            const amt = toNum((p as { amount: string | number | null }).amount)
            return (p as { type: string }).type === REFUND_PAYMENT_TYPE ? acc - amt : acc + amt
          }, 0)
        })(),
      ])
      if (cancelled) return

      // Véhicules disponibles — active fleet minus those rented today.
      const rented = new Set(rentedToday)
      const fleetAvailable = Math.max(0, fleetTotal - rented.size)

      // 4) Remises + retours du jour (from the agenda, today only).
      const todayCount =
        agendaData.pickups.filter((p) => p.date === today).length +
        agendaData.returns.filter((r) => r.date === today).length

      setAgenda(agendaData)
      setKpis({
        activeContracts: activeContracts ?? 0,
        fleetTotal: fleetTotal ?? 0,
        fleetAvailable,
        todayCount,
        monthRevenue,
      })
      setCanFin(fin)
      setLoading(false)
    })().catch(() => {
      if (cancelled) return
      setLoadError('Impossible de charger le tableau de bord.')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [reloadKey])

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

      {loadError ? (
        /* Graceful fetch-failure state with retry (re-runs the mount effect). */
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium text-[var(--text-primary)]">{loadError}</p>
          <button
            type="button"
            onClick={() => { setLoading(true); setLoadError(null); setReloadKey((k) => k + 1) }}
            className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Réessayer
          </button>
        </div>
      ) : loading ? (
        /* Internal KPI skeleton — reuses the loading.tsx kpi-card shape. */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="kpi-card p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
                <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-8 w-24 rounded bg-[var(--bg-elevated)] animate-pulse" />
                <div className="h-3 w-28 rounded bg-[var(--bg-elevated)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* KPI cards (markup unchanged — animations untouched in this pass). */
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
      )}

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
      {loading && !loadError ? (
        /* Internal agenda skeleton — reuses the loading.tsx agenda shape. */
        <div className="glass-card p-6 rounded-2xl">
          <div className="h-5 w-44 rounded bg-[var(--bg-elevated)] animate-pulse" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
            ))}
          </div>
        </div>
      ) : !loadError ? (
        <RentalAgendaWidget agenda={agenda} today={days.today} tomorrow={days.tomorrow} />
      ) : null}

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
