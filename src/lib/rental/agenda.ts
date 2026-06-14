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

// One rental as needed by the calendar (richer than AgendaItem: immat + total).
export type CalendarRental = {
  id:              string
  contract_number: string | null
  status:          string
  start_date:      string
  start_time:      string   // HH:mm ('' if none)
  end_date:        string
  end_time:        string   // HH:mm ('' if none)
  customer_name:   string
  vehicle_label:   string
  immatriculation: string | null
  total:           number | null
}

export type DayBucket = {
  remises:  CalendarRental[]  // start_date === day
  retours:  CalendarRental[]  // end_date   === day
  enCours:  CalendarRental[]  // start_date <  day < end_date
}

// Product-fixed: only firm bookings occupy the calendar. tentative_*, draft,
// reporter, cancelled are excluded; deleted_at IS NULL enforced in the query.
const CALENDAR_STATUSES = ['confirmed', 'active', 'completed', 'overdue']

const CALENDAR_SELECT =
  'id, contract_number, status, start_date, start_time, end_date, end_time, total_rental_amount, ' +
  'rental_vehicle:rental_vehicles(marque, modele, immatriculation), customer:rental_customers(full_name)'

type CalVehicleEmbed = { marque: string; modele: string; immatriculation: string | null }
type CalRawRow = {
  id: string; contract_number: string | null; status: string
  start_date: string; start_time: string | null; end_date: string; end_time: string | null
  total_rental_amount: string | number | null
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
      if (r.start_date < d && d < r.end_date) map[d].enCours.push(r)
    }
  }
  return map
}
