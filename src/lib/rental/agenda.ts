// ─────────────────────────────────────────────────────────────────────
// Rental agenda — live-computed pickups / returns / overdue.
// ─────────────────────────────────────────────────────────────────────
// No cron, no stored rows: the upcoming pickups (confirmed, start today/
// tomorrow), expected returns (active, end today/tomorrow) and overdue
// rentals are computed on demand from the rentals table. Used by the
// Location hub widget and the live notification-bell section.
//
// Timezone: Algeria = Africa/Algiers (UTC+1, no DST). "today/tomorrow" are
// the Algiers wall-clock dates, derived by shifting UTC +1h then taking the
// date part — avoids off-by-one around midnight.
// ─────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDateFr, toNum } from '@/components/rental/booking/types'

export type AgendaKind = 'pickup' | 'return' | 'overdue'

export type AgendaItem = {
  id:              string   // rental id → /dashboard/location/contrats/[id]
  contract_number: string | null
  customer_name:   string
  vehicle_label:   string
  date:            string   // yyyy-mm-dd (start for pickup, end for return/overdue)
  time:            string   // HH:mm
  kind:            AgendaKind
  status:          string
}

export type RentalAgenda = {
  pickups: AgendaItem[]
  returns: AgendaItem[]
  overdue: AgendaItem[]
}

const ALGIERS_OFFSET_MS = 60 * 60 * 1000 // UTC+1, fixed (no DST)

/** Today's date (yyyy-mm-dd) in Africa/Algiers. */
export function algiersToday(): string {
  return new Date(Date.now() + ALGIERS_OFFSET_MS).toISOString().slice(0, 10)
}
/** Add N days to a yyyy-mm-dd date string. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
/** "Aujourd'hui" / "Demain" / short French date. */
export function relativeDayLabel(dateISO: string, today: string, tomorrow: string): string {
  if (dateISO === today) return "Aujourd'hui"
  if (dateISO === tomorrow) return 'Demain'
  return formatDateFr(dateISO)
}

const SELECT =
  'id, contract_number, status, start_date, start_time, end_date, end_time, ' +
  'rental_vehicle:rental_vehicles(marque, modele), customer:rental_customers(full_name)'

type VehicleEmbed = { marque: string; modele: string }
type CustomerEmbed = { full_name: string }
type RawRow = {
  id: string; contract_number: string | null; status: string
  start_date: string; start_time: string | null; end_date: string; end_time: string | null
  rental_vehicle: VehicleEmbed | VehicleEmbed[] | null
  customer: CustomerEmbed | CustomerEmbed[] | null
}
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}
function toItem(r: RawRow, kind: AgendaKind): AgendaItem {
  const v = firstOf(r.rental_vehicle)
  const c = firstOf(r.customer)
  const isPickup = kind === 'pickup'
  return {
    id: r.id,
    contract_number: r.contract_number ?? null,
    customer_name: c?.full_name ?? '—',
    vehicle_label: v ? `${v.marque} ${v.modele}` : '—',
    date: isPickup ? r.start_date : r.end_date,
    time: ((isPickup ? r.start_time : r.end_time) ?? '').slice(0, 5),
    kind,
    status: r.status,
  }
}

const RENTAL_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])

/**
 * Compute the live agenda, scoped to the showroom + (for closer) own rows.
 * RLS also enforces this; roles without rental access get an empty agenda.
 */
export async function computeRentalAgenda(
  sb: SupabaseClient,
  opts: { showroomId: string | null; role: string; userId: string },
): Promise<RentalAgenda> {
  if (!RENTAL_ROLES.has(opts.role)) return { pickups: [], returns: [], overdue: [] }

  const today = algiersToday()
  const tomorrow = addDaysISO(today, 1)

  // Pickups: confirmed, starting today or tomorrow.
  let pq = sb.from('rentals').select(SELECT)
    .eq('status', 'confirmed').in('start_date', [today, tomorrow])
    .order('start_date', { ascending: true }).order('start_time', { ascending: true }).limit(25)
  // Returns: active, ending today or tomorrow.
  let rq = sb.from('rentals').select(SELECT)
    .eq('status', 'active').in('end_date', [today, tomorrow])
    .order('end_date', { ascending: true }).order('end_time', { ascending: true }).limit(25)
  // Overdue: explicitly overdue, OR active/confirmed past their end date.
  let oq = sb.from('rentals').select(SELECT)
    .or(`status.eq.overdue,and(status.in.(active,confirmed),end_date.lt.${today})`)
    .order('end_date', { ascending: true }).limit(25)

  if (opts.showroomId) {
    pq = pq.eq('showroom_id', opts.showroomId)
    rq = rq.eq('showroom_id', opts.showroomId)
    oq = oq.eq('showroom_id', opts.showroomId)
  }
  if (opts.role === 'closer') {
    pq = pq.eq('assigned_to', opts.userId)
    rq = rq.eq('assigned_to', opts.userId)
    oq = oq.eq('assigned_to', opts.userId)
  }

  const [pRes, rRes, oRes] = await Promise.all([pq, rq, oq])
  const pickups = ((pRes.data ?? []) as unknown as RawRow[]).map((r) => toItem(r, 'pickup'))
  const returns = ((rRes.data ?? []) as unknown as RawRow[]).map((r) => toItem(r, 'return'))
  const overdue = ((oRes.data ?? []) as unknown as RawRow[]).map((r) => toItem(r, 'overdue'))
  return { pickups, returns, overdue }
}

// ═════════════════════════════════════════════════════════════════════════
// Monthly calendar (Agenda location) — ADDITIVE. Does not touch the widget
// path above (computeRentalAgenda / RentalAgendaWidget stay as-is).
// ═════════════════════════════════════════════════════════════════════════

/** First-of-month (yyyy-mm-01) for any yyyy-mm-dd date string. */
export function monthFirstOf(dateISO: string): string {
  return dateISO.slice(0, 8) + '01'
}

/** Shift a yyyy-mm-01 month by N months, returning the new first-of-month. */
export function addMonthsISO(monthISO: string, n: number): string {
  const total = Number(monthISO.slice(0, 4)) * 12 + (Number(monthISO.slice(5, 7)) - 1) + n
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/**
 * The fixed 6×7 (42-day) grid for a month, weeks starting MONDAY.
 * gridStart = Monday of the week containing the 1st; gridEnd = gridStart + 41
 * days (always 6 rows → no month-to-month layout jump).
 */
export function monthGridRange(monthISO: string): { gridStart: string; gridEnd: string } {
  const first = monthFirstOf(monthISO)
  const dow = new Date(first + 'T00:00:00Z').getUTCDay() // 0=Sun … 6=Sat
  const mondayOffset = (dow + 6) % 7                      // Mon=0 … Sun=6
  const gridStart = addDaysISO(first, -mondayOffset)
  return { gridStart, gridEnd: addDaysISO(gridStart, 41) }
}

// One rental as needed by the calendar (richer than AgendaItem: immat + total
// + the raw ids the cockpit filters / free-vehicles need).
export type CalendarRental = {
  id:               string
  contract_number:  string | null
  status:           string
  start_date:       string
  start_time:       string   // HH:mm ('' if none)
  end_date:         string
  end_time:         string   // HH:mm ('' if none)
  customer_name:    string
  vehicle_label:    string
  immatriculation:  string | null
  rental_vehicle_id: string | null
  assigned_to:      string | null
  total:            number | null
}

export type DayBucket = {
  remises:  CalendarRental[]  // start_date === day
  retours:  CalendarRental[]  // end_date   === day
  enCours:  CalendarRental[]  // start_date <  day < end_date
}

// Product-fixed: only firm bookings occupy the calendar. tentative_*, draft,
// reporter, cancelled are excluded; deleted_at IS NULL enforced in the query.
const CALENDAR_STATUSES = ['confirmed', 'active', 'completed', 'overdue']

// Statuses that physically HOLD a vehicle: confirmed (reserved), active (out),
// overdue (out, past due). NOT completed (returned) and NOT cancelled (excluded
// from the calendar entirely). SINGLE source shared by freeVehiclesForDay AND
// the enCours bucket, so "en cours" is exactly the complement of "libre" — a
// vehicle can never be both occupied and listed free.
const OCCUPYING_STATUSES = new Set(['confirmed', 'active', 'overdue'])

const CALENDAR_SELECT =
  'id, contract_number, status, start_date, start_time, end_date, end_time, total_rental_amount, ' +
  'rental_vehicle_id, assigned_to, ' +
  'rental_vehicle:rental_vehicles(marque, modele, immatriculation), customer:rental_customers(full_name)'

type CalVehicleEmbed = { marque: string; modele: string; immatriculation: string | null }
type CalRawRow = {
  id: string; contract_number: string | null; status: string
  start_date: string; start_time: string | null; end_date: string; end_time: string | null
  total_rental_amount: string | number | null
  rental_vehicle_id: string | null; assigned_to: string | null
  rental_vehicle: CalVehicleEmbed | CalVehicleEmbed[] | null
  customer: CustomerEmbed | CustomerEmbed[] | null
}
function toCalendarRental(r: CalRawRow): CalendarRental {
  const v = firstOf(r.rental_vehicle)
  const c = firstOf(r.customer)
  return {
    id: r.id,
    contract_number: r.contract_number ?? null,
    status: r.status,
    start_date: r.start_date,
    start_time: (r.start_time ?? '').slice(0, 5),
    end_date: r.end_date,
    end_time: (r.end_time ?? '').slice(0, 5),
    customer_name: c?.full_name ?? '—',
    vehicle_label: v ? `${v.marque} ${v.modele}` : '—',
    immatriculation: v?.immatriculation ?? null,
    rental_vehicle_id: r.rental_vehicle_id ?? null,
    assigned_to: r.assigned_to ?? null,
    total: r.total_rental_amount == null ? null : toNum(r.total_rental_amount),
  }
}

/**
 * Fetch every firm rental whose [start_date, end_date] overlaps the visible
 * grid. Scoped to the showroom + (closer) own rows; RLS double-enforces.
 * Roles without rental access get an empty list. Throws on query error so the
 * caller can surface a retry state.
 */
export async function fetchRentalsForRange(
  sb: SupabaseClient,
  opts: { showroomId: string | null; role: string; userId: string; gridStart: string; gridEnd: string },
): Promise<CalendarRental[]> {
  if (!RENTAL_ROLES.has(opts.role)) return []

  let q = sb.from('rentals').select(CALENDAR_SELECT)
    .lte('start_date', opts.gridEnd)     // overlap: starts on/before the grid end…
    .gte('end_date', opts.gridStart)     // …and ends on/after the grid start
    .is('deleted_at', null)
    .in('status', CALENDAR_STATUSES)
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (opts.showroomId) q = q.eq('showroom_id', opts.showroomId)
  if (opts.role === 'closer') q = q.eq('assigned_to', opts.userId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as CalRawRow[]).map(toCalendarRental)
}

/**
 * Bucket rentals into the 42 grid days: a rental drops a "remise" on its
 * start day, a "retour" on its end day, and "enCours" on every day strictly
 * between. Returns an entry for EVERY grid day (empty buckets included).
 */
export function bucketByDay(
  rentals: CalendarRental[], gridStart: string, gridEnd: string,
): Record<string, DayBucket> {
  const map: Record<string, DayBucket> = {}
  for (let d = gridStart; d <= gridEnd; d = addDaysISO(d, 1)) {
    map[d] = { remises: [], retours: [], enCours: [] }
  }
  for (const r of rentals) {
    for (const d in map) {
      if (r.start_date === d) map[d].remises.push(r)
      if (r.end_date === d) map[d].retours.push(r)
      // enCours = strictly between, AND the status actually occupies the
      // vehicle (excludes completed) — same set as freeVehiclesForDay, so a
      // "Terminé — Rendu" never shows "en cours" while its car is listed free.
      if (OCCUPYING_STATUSES.has(r.status) && r.start_date < d && d < r.end_date) map[d].enCours.push(r)
    }
  }
  return map
}

// ── Cockpit extras (Step 2): fleet, month stats, free vehicles, overdue ──────

export type FleetVehicle = { id: string; marque: string; modele: string; immatriculation: string }

/** Active fleet of a showroom (for the vehicle filter + free-vehicles calc). */
export async function fetchFleet(sb: SupabaseClient, showroomId: string | null): Promise<FleetVehicle[]> {
  let q = sb.from('rental_vehicles')
    .select('id, marque, modele, immatriculation')
    .eq('is_active', true)
    .order('marque', { ascending: true }).order('modele', { ascending: true })
  if (showroomId) q = q.eq('showroom_id', showroomId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as FleetVehicle[]
}

export type MonthStats = { remises: number; retours: number; enCours: number }

/**
 * Counts for the DISPLAYED month only (grid-overflow days excluded):
 *  - remises  = rentals starting in the month
 *  - retours  = rentals ending in the month
 *  - enCours  = 'active'  rentals overlapping the month
 * (Overdue is NOT a month stat — the "En retard" tile uses the GLOBAL overdue
 *  count from fetchOverdue, identical to the banner, so the two never disagree.)
 */
export function monthStats(rentals: CalendarRental[], monthISO: string): MonthStats {
  const m = monthISO.slice(0, 7)
  const monthStart = monthFirstOf(monthISO)
  const monthEnd = addDaysISO(addMonthsISO(monthISO, 1), -1)
  let remises = 0, retours = 0, enCours = 0
  for (const r of rentals) {
    if (r.start_date.slice(0, 7) === m) remises++
    if (r.end_date.slice(0, 7) === m) retours++
    const overlaps = r.start_date <= monthEnd && r.end_date >= monthStart
    if (overlaps && r.status === 'active') enCours++
  }
  return { remises, retours, enCours }
}

/**
 * Vehicles with NO active/confirmed rental covering dayISO (start<=day<=end).
 * Computed from the already-fetched month rentals — no per-day query.
 */
export function freeVehiclesForDay(
  fleet: FleetVehicle[], rentals: CalendarRental[], dayISO: string,
): FleetVehicle[] {
  const busy = new Set<string>()
  for (const r of rentals) {
    if (OCCUPYING_STATUSES.has(r.status)
      && r.rental_vehicle_id
      && r.start_date <= dayISO && dayISO <= r.end_date) {
      busy.add(r.rental_vehicle_id)
    }
  }
  return fleet.filter((v) => !busy.has(v.id))
}

/**
 * Overdue rentals — status active/overdue past their end date (Algiers today),
 * INDEPENDENT of the displayed month (an overdue from 2 months ago still counts).
 * Scoped to the showroom + (closer) own rows; RLS double-enforces.
 */
export async function fetchOverdue(
  sb: SupabaseClient,
  opts: { showroomId: string | null; role: string; userId: string },
): Promise<CalendarRental[]> {
  if (!RENTAL_ROLES.has(opts.role)) return []
  const today = algiersToday()
  let q = sb.from('rentals').select(CALENDAR_SELECT)
    .in('status', ['active', 'overdue'])
    .lt('end_date', today)
    .is('deleted_at', null)
    .order('end_date', { ascending: true })
  if (opts.showroomId) q = q.eq('showroom_id', opts.showroomId)
  if (opts.role === 'closer') q = q.eq('assigned_to', opts.userId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as CalRawRow[]).map(toCalendarRental)
}

// ── Gantt span bars (desktop grid) — week-split + lane packing ────────────────

/** Whole-day count between two yyyy-mm-dd dates (b - a). */
export function daysBetweenISO(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
}

// Max lanes (stacked bars) rendered per day before collapsing into a per-day
// "+N" overflow count. Kept small so a week row stays a stable height.
export const AGENDA_MAX_LANES = 3

export type WeekSegment = {
  id:       string   // rental id → /dashboard/location/contrats/[id]
  colStart: number   // 1..7 (Mon..Sun) within the week
  colSpan:  number
  isStart:  boolean  // the rental's real start_date falls in this week
  isEnd:    boolean  // the rental's real end_date falls in this week
  status:   string
  label:    string   // "client · véhicule"
  lane:     number   // 0-based packing lane
}
export type WeekRow = {
  weekStart:     string
  days:          string[]  // 7 yyyy-mm-dd
  segments:      WeekSegment[]   // ALL segments incl. overflow (lane >= MAX visible filter at render)
  overflowByCol: number[]        // length 7 — hidden-segment count per day column
}

/**
 * Split each rental into ONE clipped segment per week it overlaps, then
 * lane-pack each week greedily (sorted by colStart → smallest non-overlapping
 * lane). Segments with lane >= AGENDA_MAX_LANES are counted as per-day overflow
 * ("+N") rather than drawn. `days` is the 42-day Monday grid (6×7).
 */
export function buildWeekRows(rentals: CalendarRental[], days: string[]): WeekRow[] {
  const rows: WeekRow[] = []
  for (let w = 0; w * 7 < days.length; w++) {
    const weekDays = days.slice(w * 7, w * 7 + 7)
    const weekStart = weekDays[0]
    const weekEnd = weekDays[6]

    const segments: WeekSegment[] = []
    for (const r of rentals) {
      if (r.start_date > weekEnd || r.end_date < weekStart) continue   // no overlap
      const segStart = r.start_date < weekStart ? weekStart : r.start_date
      const segEnd = r.end_date > weekEnd ? weekEnd : r.end_date
      segments.push({
        id:       r.id,
        colStart: daysBetweenISO(weekStart, segStart) + 1,
        colSpan:  daysBetweenISO(segStart, segEnd) + 1,
        isStart:  r.start_date >= weekStart,
        isEnd:    r.end_date <= weekEnd,
        status:   r.status,
        label:    `${r.customer_name} · ${r.vehicle_label}`,
        lane:     -1,
      })
    }

    // Greedy interval partitioning: by colStart, smallest lane whose last
    // occupied column is strictly before this segment's start.
    segments.sort((a, b) => a.colStart - b.colStart || b.colSpan - a.colSpan)
    const laneEnd: number[] = []  // rightmost occupied column per lane
    for (const s of segments) {
      let lane = 0
      while (lane < laneEnd.length && laneEnd[lane] >= s.colStart) lane++
      s.lane = lane
      laneEnd[lane] = s.colStart + s.colSpan - 1
    }

    const overflowByCol = new Array<number>(7).fill(0)
    for (const s of segments) {
      if (s.lane < AGENDA_MAX_LANES) continue
      for (let c = s.colStart; c < s.colStart + s.colSpan; c++) overflowByCol[c - 1]++
    }

    rows.push({ weekStart, days: weekDays, segments, overflowByCol })
  }
  return rows
}
