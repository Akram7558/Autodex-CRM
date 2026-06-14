'use client'
// ─────────────────────────────────────────────────────────────────────
// RentalAgendaCalendar — Location "cockpit" (monthly calendar + stats).
// ─────────────────────────────────────────────────────────────────────
// Self-fetching, persistent-shell pattern (mirrors RentalHubView /
// RentalProspectsList): the header, month controls, stat tiles, filter bar,
// grid and panel are ALWAYS mounted; only the data zones swap pulse↔content,
// so navigating months / loading never blinks or shifts. Identity/role/
// showroom resolve client-side (getCurrentUserRole); queries are RLS-scoped
// (showroom isolation; closer → own rentals via assigned_to).
//
// Role gating (CRITICAL): owner/manager see the whole showroom + the
// "véhicules libres" panel + the agent filter; closer sees only their own
// rentals and the manager-only widgets are HIDDEN (never computed wrong).
//
// Placement: a rental drops a Remise chip on start_date and a Retour chip on
// end_date (Option A). Click a day → side panel (Remises / Retours / En cours
// + véhicules libres). Mobile swaps the grid for a chronological list.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarClock, ChevronLeft, ChevronRight, ChevronDown, ArrowUpRight, ArrowDownLeft,
  Repeat, AlertTriangle, Car,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserRole } from '@/lib/auth'
import {
  algiersToday, addDaysISO, monthFirstOf, addMonthsISO, monthGridRange,
  fetchRentalsForRange, fetchFleet, fetchOverdue, bucketByDay, monthStats, freeVehiclesForDay,
  buildWeekRows, AGENDA_MAX_LANES,
  type CalendarRental, type DayBucket, type FleetVehicle, type WeekRow,
} from '@/lib/rental/agenda'
import { rentalStatusColor, rentalStatusLabel, formatDZD } from '@/components/rental/booking/types'
import { toneClasses } from '@/lib/notif-style'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const EMPTY_BUCKET: DayBucket = { remises: [], retours: [], enCours: [] }
const STATUS_FILTERS = ['confirmed', 'active', 'completed', 'overdue'] as const

type Agent = { userId: string; name: string }

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
function dayHeading(dayISO: string, today: string): string {
  if (dayISO === today) return "Aujourd'hui"
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(dayISO + 'T00:00:00Z'))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function RentalAgendaCalendar() {
  const today = useMemo(() => algiersToday(), [])
  const [monthISO, setMonthISO] = useState(() => monthFirstOf(today))
  const [selectedDay, setSelectedDay] = useState<string>(today)

  const [rentals, setRentals] = useState<CalendarRental[]>([])   // raw month rentals (unfiltered)
  const [fleet, setFleet] = useState<FleetVehicle[]>([])
  const [overdue, setOverdue] = useState<CalendarRental[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [canManage, setCanManage] = useState(false)             // owner/manager only

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Filters — persist across month changes (state lives here, untouched by nav).
  const [filterVehicle, setFilterVehicle] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set())
  const [overdueOpen, setOverdueOpen] = useState(false)

  const { gridStart, gridEnd } = monthGridRange(monthISO)
  const monthKey = monthISO.slice(0, 7)
  const days = useMemo(() => {
    const out: string[] = []
    let d = gridStart
    for (let i = 0; i < 42; i++) { out.push(d); d = addDaysISO(d, 1) }
    return out
  }, [gridStart])

  // ── Mount / month fetch ────────────────────────────────────────────────
  // loading is reset by the nav / retry HANDLERS (never synchronously in the
  // effect) so the persistent shell stays mounted across month changes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const me = await getCurrentUserRole()
      if (cancelled) return
      if (!me) {
        setRentals([]); setFleet([]); setOverdue([]); setAgents([]); setCanManage(false)
        setLoading(false); return
      }
      const manage = me.role === 'owner' || me.role === 'manager'
      const { gridStart: gs, gridEnd: ge } = monthGridRange(monthISO)
      try {
        const [monthRows, fleetRows, overdueRows] = await Promise.all([
          fetchRentalsForRange(supabase, { showroomId: me.showroomId, role: me.role, userId: me.userId, gridStart: gs, gridEnd: ge }),
          fetchFleet(supabase, me.showroomId),
          fetchOverdue(supabase, { showroomId: me.showroomId, role: me.role, userId: me.userId }),
        ])
        if (cancelled) return
        // Clear any stale error from a prior failed attempt (e.g. nav after a
        // failed initial load) — without this the error screen would stick.
        setLoadError(null)
        setRentals(monthRows); setFleet(fleetRows); setOverdue(overdueRows); setCanManage(manage)

        // Agent filter source — owner/manager only (GET /api/employees is
        // requireShowroomAdmin). Failure never blocks the calendar.
        if (manage) {
          try {
            const res = await fetch('/api/employees')
            const json = await res.json()
            if (!cancelled && Array.isArray(json.employees)) {
              setAgents((json.employees as Array<{ user_id: string; full_name: string | null; email: string | null }>)
                .map((e) => ({ userId: e.user_id, name: e.full_name || e.email || 'Agent' })))
            }
          } catch { /* keep agents empty — filter just won't list anyone */ }
        } else {
          setAgents([])
        }
        if (!cancelled) setLoading(false)
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
    const m = addMonthsISO(monthISO, delta)
    setMonthISO(m)
    setSelectedDay(m) // keep the panel within the displayed month
  }
  function goToday() {
    setSelectedDay(today)
    // Only (re)fetch when the month actually changes — re-assigning the same
    // monthISO is a React no-op, so the effect would not re-run and loading
    // would stick true forever. (Guarded; verified bug from Step 1.)
    const m = monthFirstOf(today)
    if (m !== monthISO) { setLoading(true); setMonthISO(m) }
  }
  function retry() {
    setLoading(true); setLoadError(null); setReloadKey((k) => k + 1)
  }
  function toggleStatus(s: string) {
    setFilterStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  // Client-side filters on the month data (cheap). Empty status set = all.
  const filtered = useMemo(() => rentals.filter((r) => {
    if (filterVehicle && r.rental_vehicle_id !== filterVehicle) return false
    if (filterAgent && r.assigned_to !== filterAgent) return false
    if (filterStatuses.size > 0 && !filterStatuses.has(r.status)) return false
    return true
  }), [rentals, filterVehicle, filterAgent, filterStatuses])

  const buckets = useMemo(() => bucketByDay(filtered, gridStart, gridEnd), [filtered, gridStart, gridEnd])
  // Desktop Gantt: span bars, lane-packed per week. Re-packs on filter change.
  const weekRows = useMemo(() => buildWeekRows(filtered, days), [filtered, days])
  const stats = useMemo(() => monthStats(filtered, monthISO), [filtered, monthISO])
  // Free vehicles use the RAW month rentals (occupancy is filter-independent).
  const freeVehicles = useMemo(
    () => (canManage ? freeVehiclesForDay(fleet, rentals, selectedDay) : []),
    [canManage, fleet, rentals, selectedDay],
  )
  const listDays = useMemo(
    () => days.filter((d) => d.slice(0, 7) === monthKey
      && ((buckets[d]?.remises.length ?? 0) + (buckets[d]?.retours.length ?? 0)) > 0),
    [days, monthKey, buckets],
  )

  const tone = toneClasses('critical') // overdue banner = rose

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

      {/* Month controls */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => goMonth(-1)} aria-label="Mois précédent"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors duration-150 motion-reduce:transition-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="min-w-[10rem] text-center text-sm font-semibold text-[var(--text-primary)]">
          {monthLabelFr(monthISO)}
        </span>
        <button type="button" onClick={() => goMonth(1)} aria-label="Mois suivant"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors duration-150 motion-reduce:transition-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button type="button" onClick={goToday}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          Aujourd&apos;hui
        </button>
      </div>

      {loadError ? (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium text-[var(--text-primary)]">{loadError}</p>
          <button type="button" onClick={retry}
            className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}>
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {/* Overdue banner (month-independent; only when > 0) */}
          {!loading && overdue.length > 0 && (
            <div className={`rounded-2xl ${tone.highlightBg}`} style={{ border: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setOverdueOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 motion-reduce:transition-none">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone.tile}`}>
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  {overdue.length} location{overdue.length > 1 ? 's' : ''} en retard
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform motion-reduce:transition-none ${overdueOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-muted)' }} />
              </button>
              {overdueOpen && (
                <ul className="px-3 pb-3 space-y-1.5">
                  {overdue.map((r) => <PanelRow key={r.id} r={r} time={r.end_time} />)}
                </ul>
              )}
            </div>
          )}

          {/* Stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Remises" value={stats.remises} icon={ArrowUpRight} loading={loading} />
            <StatTile label="Retours" value={stats.retours} icon={ArrowDownLeft} loading={loading} />
            <StatTile label="En cours" value={stats.enCours} icon={Repeat} loading={loading} />
            {/* Global overdue count — SAME source as the banner (fetchOverdue),
                month-independent, so the tile and banner never disagree. */}
            <StatTile label="En retard" value={overdue.length} icon={AlertTriangle} loading={loading} rose />
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} aria-label="Filtrer par véhicule"
              className="h-10 px-3 rounded-xl text-sm transition-colors duration-150 motion-reduce:transition-none outline-none"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <option value="">Tous les véhicules</option>
              {fleet.map((v) => (
                <option key={v.id} value={v.id}>{v.marque} {v.modele} · {v.immatriculation}</option>
              ))}
            </select>

            {canManage && agents.length > 0 && (
              <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} aria-label="Filtrer par agent"
                className="h-10 px-3 rounded-xl text-sm transition-colors duration-150 motion-reduce:transition-none outline-none"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <option value="">Tous les agents</option>
                {agents.map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
              </select>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((s) => {
                const active = filterStatuses.has(s)
                const c = eventColor(s)
                return (
                  <button key={s} type="button" onClick={() => toggleStatus(s)} aria-pressed={active}
                    className="px-3 h-8 rounded-full text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none"
                    style={active
                      ? { background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }
                      : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    {rentalStatusLabel(s)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Main: grid (desktop) / list (mobile) + day panel */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
            <div className="space-y-3">
              {/* Desktop grid — Gantt span bars (week-split + lane packing) */}
              <div className="hidden lg:block glass-card p-4 rounded-2xl overflow-x-auto">
                <div className="min-w-[42rem]">
                  <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                    {WEEKDAYS.map((w, i) => (
                      <div key={i} className="text-center text-[11px] font-bold uppercase tracking-wider py-1"
                        style={{ color: 'var(--text-muted)' }}>{w}</div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {weekRows.map((row) => (
                      <WeekRowView key={row.weekStart} row={row}
                        today={today} selectedDay={selectedDay} monthKey={monthKey}
                        loading={loading} onSelect={setSelectedDay} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Mobile chronological list */}
              <div className="lg:hidden glass-card p-4 rounded-2xl">
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="h-14 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
                    ))}
                  </div>
                ) : listDays.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                    Aucune location ce mois.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {listDays.map((d) => {
                      const b = buckets[d] ?? EMPTY_BUCKET
                      return (
                        <div key={d}>
                          <button type="button" onClick={() => setSelectedDay(d)}
                            className="text-[11px] font-bold uppercase tracking-wider mb-2"
                            style={{ color: d === selectedDay ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {dayHeading(d, today)}
                          </button>
                          <ul className="space-y-1.5">
                            {b.remises.map((r) => <PanelRow key={`${r.id}-r`} r={r} time={r.start_time} kind="remise" />)}
                            {b.retours.map((r) => <PanelRow key={`${r.id}-t`} r={r} time={r.end_time} kind="retour" />)}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Legend */}
              <Legend />
            </div>

            <DayPanel day={selectedDay} today={today} loading={loading}
              bucket={buckets[selectedDay] ?? EMPTY_BUCKET}
              canManage={canManage} freeVehicles={freeVehicles} fleetTotal={fleet.length} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Stat tile ────────────────────────────────────────────────────────────
function StatTile({
  label, value, icon: Icon, loading, rose,
}: {
  label: string; value: number; icon: typeof ArrowUpRight; loading: boolean; rose?: boolean
}) {
  return (
    <div className="kpi-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <Icon className="w-4 h-4" style={{ color: rose ? '#fb7185' : 'var(--accent)' }} />
      </div>
      <p className="text-2xl font-bold tabular-nums"
        style={{ color: rose && value > 0 ? '#fb7185' : 'var(--text-primary)' }}>
        {loading
          ? <span className="inline-block align-middle h-6 w-10 rounded bg-[var(--bg-elevated)] animate-pulse" />
          : value}
      </p>
    </div>
  )
}

// ── Calendar cell ────────────────────────────────────────────────────────
// ── Desktop Gantt week row ───────────────────────────────────────────────
// One CSS grid per week: 7 day columns × (1 day-number row + AGENDA_MAX_LANES
// lane rows). Per-column background buttons (full height) handle "click empty
// → select day"; the day-number overlay is non-interactive (clicks fall through
// to the bg button); span bars sit on top in their packed lane and link to the
// contract. Grid geometry comes from `row.days` (stable), so the lane content
// can swap skeleton↔bars without remount/blink.
function WeekRowView({
  row, today, selectedDay, monthKey, loading, onSelect,
}: {
  row: WeekRow
  today: string
  selectedDay: string
  monthKey: string
  loading: boolean
  onSelect: (day: string) => void
}) {
  const visible = row.segments.filter((s) => s.lane < AGENDA_MAX_LANES)
  return (
    <div className="grid grid-cols-7 gap-1.5"
      style={{ gridTemplateRows: `auto repeat(${AGENDA_MAX_LANES}, 1.375rem)` }}>
      {/* Background cells — full-height click target + the day's visual frame. */}
      {row.days.map((day, ci) => {
        const inMonth = day.slice(0, 7) === monthKey
        const isToday = day === today
        const isSelected = day === selectedDay
        return (
          <button key={`bg-${day}`} type="button" onClick={() => onSelect(day)} aria-label={`Jour ${Number(day.slice(8, 10))}`}
            className="rounded-lg transition-colors duration-150 motion-reduce:transition-none hover:border-[var(--accent)]"
            style={{
              gridColumn: ci + 1, gridRow: '1 / -1',
              background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
              opacity: inMonth ? 1 : 0.45,
            }} />
        )
      })}

      {/* Day numbers + per-day "+N" overflow (overlay, clicks pass through). */}
      {row.days.map((day, ci) => {
        const isToday = day === today
        const ov = row.overflowByCol[ci]
        return (
          <div key={`num-${day}`} className="flex items-center justify-between px-1.5 pt-1"
            style={{ gridColumn: ci + 1, gridRow: 1, zIndex: 10, pointerEvents: 'none' }}>
            <span className="text-xs font-semibold tabular-nums"
              style={{ color: isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>{Number(day.slice(8, 10))}</span>
            {!loading && ov > 0 && (
              <span className="text-[9px] font-bold tabular-nums px-1 rounded-full"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>+{ov}</span>
            )}
          </div>
        )
      })}

      {/* Lane content: skeleton bars while loading, span bars when loaded. */}
      {loading ? (
        <>
          <div style={{ gridColumn: '1 / span 3', gridRow: 2, zIndex: 10 }}
            className="h-5 rounded-md bg-[var(--bg-elevated)] animate-pulse self-center" />
          <div style={{ gridColumn: '4 / span 3', gridRow: 3, zIndex: 10 }}
            className="h-5 rounded-md bg-[var(--bg-elevated)] animate-pulse self-center" />
        </>
      ) : (
        visible.map((s) => {
          const c = eventColor(s.status)
          return (
            <Link key={s.id} href={`/dashboard/location/contrats/${s.id}`} title={s.label}
              className="flex items-center gap-1 px-1.5 text-[10px] font-medium leading-none overflow-hidden self-center h-5 transition-opacity duration-150 motion-reduce:transition-none hover:opacity-90"
              style={{
                gridColumn: `${s.colStart} / span ${s.colSpan}`, gridRow: s.lane + 2, zIndex: 10,
                background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}`,
                borderTopLeftRadius: s.isStart ? '0.375rem' : 0, borderBottomLeftRadius: s.isStart ? '0.375rem' : 0,
                borderTopRightRadius: s.isEnd ? '0.375rem' : 0, borderBottomRightRadius: s.isEnd ? '0.375rem' : 0,
              }}>
              {s.isStart && <ArrowUpRight className="w-2.5 h-2.5 shrink-0" />}
              <span className="truncate flex-1">{s.label}</span>
              {s.isEnd && <ArrowDownLeft className="w-2.5 h-2.5 shrink-0" />}
            </Link>
          )
        })
      )}
    </div>
  )
}

// ── Legend ───────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] px-1" style={{ color: 'var(--text-muted)' }}>
      <span>Barre = location (couleur = statut)</span>
      <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> bord gauche = remise</span>
      <span className="flex items-center gap-1"><ArrowDownLeft className="w-3 h-3" /> bord droit = retour</span>
      {[['confirmed', 'Réservé'], ['active', 'En cours'], ['completed', 'Terminé'], ['overdue', 'En retard']].map(([s, lbl]) => {
        const c = eventColor(s)
        return (
          <span key={s} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.fg }} />{lbl}
          </span>
        )
      })}
    </div>
  )
}

// ── Day detail panel ─────────────────────────────────────────────────────
function DayPanel({
  day, today, loading, bucket, canManage, freeVehicles, fleetTotal,
}: {
  day: string; today: string; loading: boolean; bucket: DayBucket
  canManage: boolean; freeVehicles: FleetVehicle[]; fleetTotal: number
}) {
  const empty = bucket.remises.length === 0 && bucket.retours.length === 0 && bucket.enCours.length === 0

  return (
    <aside className="glass-card p-5 rounded-2xl space-y-5" style={{ borderColor: 'var(--border)' }}>
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          {dayHeading(day, today)}
        </h2>

        {loading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-14 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
            ))}
          </div>
        ) : empty ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Aucun mouvement ce jour.</p>
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
      </div>

      {/* Véhicules libres ce jour — owner/manager only */}
      {canManage && (
        <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
            style={{ color: 'var(--accent)' }}>
            <Car className="w-3.5 h-3.5" /> Véhicules libres
            {!loading && (
              <span className="ml-auto tabular-nums font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {freeVehicles.length} / {fleetTotal}
              </span>
            )}
          </p>
          {loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-7 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
              ))}
            </div>
          ) : freeVehicles.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aucun véhicule libre ce jour.</p>
          ) : (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {freeVehicles.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <bdi className="truncate" style={{ color: 'var(--text-primary)' }}>{v.marque} {v.modele}</bdi>
                  <span className="font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{v.immatriculation}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}

function PanelGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
        {icon}{title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}

function PanelRow({ r, time, kind }: { r: CalendarRental; time?: string; kind?: 'remise' | 'retour' }) {
  const c = eventColor(r.status)
  const KindIcon = kind === 'remise' ? ArrowUpRight : kind === 'retour' ? ArrowDownLeft : null
  return (
    <li>
      <Link href={`/dashboard/location/contrats/${r.id}`}
        className="block rounded-lg px-3 py-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--bg-elevated)]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            {KindIcon && <KindIcon className="w-3.5 h-3.5 shrink-0" style={{ color: c.fg }} />}
            <span className="truncate">{r.customer_name}</span>
          </span>
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}>
            {rentalStatusLabel(r.status)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <bdi className="truncate">{r.vehicle_label}{r.immatriculation ? ` · ${r.immatriculation}` : ''}</bdi>
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
