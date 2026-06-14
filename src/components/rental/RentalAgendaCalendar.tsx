'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalAgendaCalendar — monthly rental calendar (Agenda location).
// ─────────────────────────────────────────────────────────────────────
// Self-fetching, persistent-shell pattern (mirrors RentalHubView /
// RentalProspectsList): the header, month controls and the 6×7 grid are
// ALWAYS mounted; only the per-cell events swap pulse↔chips, so navigating
// months never blinks or shifts. Identity/role/showroom resolve client-side
// (getCurrentUserRole); the query is RLS-scoped (showroom isolation; closer
// → own rentals). Each rental drops a "Remise" chip on its start day and a
// "Retour" chip on its end day (Option A). Click a day → side panel with the
// day's movements grouped Remises / Retours / En cours.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarClock, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownLeft, Repeat,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole } from '@/lib/auth'
import {
  algiersToday, addDaysISO, monthFirstOf, addMonthsISO, monthGridRange,
  fetchRentalsForRange, bucketByDay,
  type CalendarRental, type DayBucket,
} from '@/lib/rental/agenda'
import { rentalStatusColor, rentalStatusLabel, formatDZD } from '@/components/rental/booking/types'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const EMPTY_BUCKET: DayBucket = { remises: [], retours: [], enCours: [] }

// Calendar event coloring reuses the shared status palette, EXCEPT overdue,
// which the product wants in rose here (not the contracts list's amber).
const ROSE = { bg: 'rgba(244,63,94,0.14)', fg: '#fb7185', ring: 'rgba(244,63,94,0.40)' }
function eventColor(status: string) {
  return status === 'overdue' ? ROSE : rentalStatusColor(status)
}

function monthLabelFr(monthISO: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
    .format(new Date(monthISO + 'T00:00:00Z'))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function RentalAgendaCalendar() {
  const today = useMemo(() => algiersToday(), [])
  const [monthISO, setMonthISO] = useState(() => monthFirstOf(today))
  const [selectedDay, setSelectedDay] = useState<string>(today)
  const [buckets, setBuckets] = useState<Record<string, DayBucket>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const { gridStart } = monthGridRange(monthISO)
  // The 42 grid days (derived from monthISO — stable during loading, so the
  // grid geometry never changes when the data swaps in).
  const days = useMemo(() => {
    const out: string[] = []
    let d = gridStart
    for (let i = 0; i < 42; i++) { out.push(d); d = addDaysISO(d, 1) }
    return out
  }, [gridStart])
  const monthKey = monthISO.slice(0, 7)

  // ── Mount/month fetch ──────────────────────────────────────────────────
  // loading is reset by the month-nav / retry handlers (NOT synchronously in
  // the effect) so the persistent shell stays mounted across month changes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const me = await getCurrentUserRole()
      if (cancelled) return
      if (!me) { setBuckets({}); setLoading(false); return }
      const { gridStart: gs, gridEnd: ge } = monthGridRange(monthISO)
      try {
        const rentals = await fetchRentalsForRange(supabase, {
          showroomId: me.showroomId, role: me.role, userId: me.userId, gridStart: gs, gridEnd: ge,
        })
        if (cancelled) return
        setBuckets(bucketByDay(rentals, gs, ge))
        setLoading(false)
      } catch {
        if (cancelled) return
        setLoadError("Impossible de charger l'agenda.")
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [monthISO, reloadKey])

  function goMonth(delta: number) {
    setLoading(true)
    setMonthISO((m) => addMonthsISO(m, delta))
  }
  function goToday() {
    setSelectedDay(today)
    // Only trigger a (re)fetch when the month actually changes. If we're
    // already on the current month, re-assigning the identical monthISO is a
    // React no-op → the [monthISO, reloadKey] effect would NOT re-run, leaving
    // loading stuck true forever. So just re-select today in that case.
    const m = monthFirstOf(today)
    if (m !== monthISO) {
      setLoading(true)
      setMonthISO(m)
    }
  }
  function retry() {
    setLoading(true)
    setLoadError(null)
    setReloadKey((k) => k + 1)
  }

  const monthCount = useMemo(() => {
    // total firm movements in the displayed month (for the subtitle)
    let n = 0
    for (const d of days) {
      if (d.slice(0, 7) !== monthKey) continue
      const b = buckets[d]
      if (b) n += b.remises.length + b.retours.length
    }
    return n
  }, [buckets, days, monthKey])

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
          <CalendarClock className="w-3.5 h-3.5" /> Location
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">Agenda</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Remises et retours de location, posés sur le calendrier.
        </p>
      </div>

      {/* Month controls — pills (mirrors the prospects filter pills). */}
      <div className="flex items-center gap-2">
        <button
          type="button" onClick={() => goMonth(-1)} aria-label="Mois précédent"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors duration-150 motion-reduce:transition-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="min-w-[10rem] text-center text-sm font-semibold text-[var(--text-primary)]">
          {monthLabelFr(monthISO)}
        </span>
        <button
          type="button" onClick={() => goMonth(1)} aria-label="Mois suivant"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors duration-150 motion-reduce:transition-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button" onClick={goToday}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          Aujourd&apos;hui
        </button>
        {!loading && !loadError && (
          <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {monthCount} mouvement{monthCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loadError ? (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium text-[var(--text-primary)]">{loadError}</p>
          <button
            type="button" onClick={retry}
            className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Réessayer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          {/* Calendar grid (persistent shell) */}
          <div className="glass-card p-3 sm:p-4 rounded-2xl overflow-x-auto">
            <div className="min-w-[34rem]">
              {/* Weekday header */}
              <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                {WEEKDAYS.map((w, i) => (
                  <div key={i} className="text-center text-[11px] font-bold uppercase tracking-wider py-1"
                    style={{ color: 'var(--text-muted)' }}>
                    {w}
                  </div>
                ))}
              </div>
              {/* 6×7 cells */}
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((day) => (
                  <DayCell
                    key={day}
                    day={day}
                    inMonth={day.slice(0, 7) === monthKey}
                    isToday={day === today}
                    isSelected={day === selectedDay}
                    loading={loading}
                    bucket={buckets[day] ?? EMPTY_BUCKET}
                    onSelect={() => setSelectedDay(day)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Day detail panel (right on desktop, below on mobile) */}
          <DayPanel day={selectedDay} today={today} loading={loading} bucket={buckets[selectedDay] ?? EMPTY_BUCKET} />
        </div>
      )}
    </div>
  )
}

// ── Calendar cell ────────────────────────────────────────────────────────
function DayCell({
  day, inMonth, isToday, isSelected, loading, bucket, onSelect,
}: {
  day: string
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  loading: boolean
  bucket: DayBucket
  onSelect: () => void
}) {
  const dayNum = Number(day.slice(8, 10))
  const events = [
    ...bucket.remises.map((r) => ({ r, kind: 'remise' as const })),
    ...bucket.retours.map((r) => ({ r, kind: 'retour' as const })),
  ]
  const shown = events.slice(0, 2)
  const extra = events.length - shown.length

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Jour ${dayNum}`}
      className="text-left rounded-lg p-1.5 min-h-[78px] flex flex-col gap-1 transition-colors duration-150 motion-reduce:transition-none hover:border-[var(--accent)]"
      style={{
        background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
        border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
        opacity: inMonth ? 1 : 0.45,
      }}
    >
      <span className="text-xs font-semibold tabular-nums"
        style={{ color: isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>
        {dayNum}
      </span>

      {loading ? (
        <span className="h-2.5 mt-0.5 rounded bg-[var(--bg-elevated)] animate-pulse" />
      ) : (
        <span className="flex flex-col gap-1 min-w-0">
          {shown.map(({ r, kind }, i) => {
            const c = eventColor(r.status)
            const Icon = kind === 'remise' ? ArrowUpRight : ArrowDownLeft
            return (
              <span key={`${r.id}-${kind}-${i}`}
                className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium leading-none truncate"
                style={{ background: c.bg, color: c.fg }}>
                <Icon className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{r.customer_name}</span>
              </span>
            )
          })}
          {extra > 0 && (
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              +{extra}
            </span>
          )}
          {bucket.enCours.length > 0 && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <Repeat className="w-2.5 h-2.5 shrink-0" />{bucket.enCours.length} en cours
            </span>
          )}
        </span>
      )}
    </button>
  )
}

// ── Day detail panel ─────────────────────────────────────────────────────
function DayPanel({
  day, today, loading, bucket,
}: {
  day: string
  today: string
  loading: boolean
  bucket: DayBucket
}) {
  const heading = day === today
    ? "Aujourd'hui"
    : new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(day + 'T00:00:00Z'))
  const headingCap = heading.charAt(0).toUpperCase() + heading.slice(1)
  const empty = bucket.remises.length === 0 && bucket.retours.length === 0 && bucket.enCours.length === 0

  return (
    <aside className="glass-card p-5 rounded-2xl" style={{ borderColor: 'var(--border)' }}>
      <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        {headingCap}
      </h2>

      {loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-14 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
          ))}
        </div>
      ) : empty ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Aucun mouvement ce jour.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {bucket.remises.length > 0 && (
            <PanelGroup title="Remises" icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
              {bucket.remises.map((r) => <PanelRow key={r.id} r={r} time={r.start_time} />)}
            </PanelGroup>
          )}
          {bucket.retours.length > 0 && (
            <PanelGroup title="Retours" icon={<ArrowDownLeft className="w-3.5 h-3.5" />}>
              {bucket.retours.map((r) => <PanelRow key={r.id} r={r} time={r.end_time} />)}
            </PanelGroup>
          )}
          {bucket.enCours.length > 0 && (
            <PanelGroup title="En cours" icon={<Repeat className="w-3.5 h-3.5" />}>
              {bucket.enCours.map((r) => <PanelRow key={r.id} r={r} />)}
            </PanelGroup>
          )}
        </div>
      )}
    </aside>
  )
}

function PanelGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
        style={{ color: 'var(--accent)' }}>
        {icon}{title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}

function PanelRow({ r, time }: { r: CalendarRental; time?: string }) {
  const c = eventColor(r.status)
  return (
    <li>
      <Link
        href={`/dashboard/location/contrats/${r.id}`}
        className="block rounded-lg px-3 py-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--bg-elevated)]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {r.customer_name}
          </span>
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}>
            {rentalStatusLabel(r.status)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <bdi className="truncate">
            {r.vehicle_label}{r.immatriculation ? ` · ${r.immatriculation}` : ''}
          </bdi>
          <span className="tabular-nums shrink-0">{formatDZD(r.total)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {time ? <span className="tabular-nums">{time}</span> : <span />}
          {r.contract_number && <span className="font-mono">{r.contract_number}</span>}
        </div>
      </Link>
    </li>
  )
}
