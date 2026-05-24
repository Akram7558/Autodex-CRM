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
import { formatDateFr } from '@/components/rental/booking/types'

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
