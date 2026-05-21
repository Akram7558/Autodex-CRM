// ─────────────────────────────────────────────────────────────────────
// Booking wizard — shared types + pure helpers (Phase 2B).
// ─────────────────────────────────────────────────────────────────────
// Holds only what the in-memory wizard needs. The rental row is NOT
// created here — that happens at the end of step 4 (chunk 2).
// ─────────────────────────────────────────────────────────────────────

export type RentalVehicleLite = {
  id:             string
  marque:         string
  modele:         string
  annee:          number
  immatriculation: string
  daily_rate:     number
  weekly_rate:    number | null
  monthly_rate:   number | null
  deposit_amount: number
  photos_urls:    string[]
  is_active:      boolean
}

export type RentalCustomerLite = {
  id:               string
  full_name:        string
  phone:            string
  blacklisted:      boolean
  blacklist_reason: string | null
}

export type BookingState = {
  step:      1 | 2 | 3 | 4
  vehicle:   RentalVehicleLite | null
  startDate: string   // yyyy-mm-dd
  endDate:   string   // yyyy-mm-dd
  startTime: string   // HH:mm
  endTime:   string   // HH:mm
  customer:  RentalCustomerLite | null
}

export type BookingAction =
  | { type: 'SET_VEHICLE';  vehicle: RentalVehicleLite | null }
  | { type: 'SET_DATES';    patch: Partial<Pick<BookingState, 'startDate' | 'endDate' | 'startTime' | 'endTime'>> }
  | { type: 'SET_CUSTOMER'; customer: RentalCustomerLite | null }
  | { type: 'GOTO';         step: BookingState['step'] }

export function initialBookingState(): BookingState {
  return {
    step:      1,
    vehicle:   null,
    startDate: '',
    endDate:   '',
    startTime: '09:00',
    endTime:   '18:00',
    customer:  null,
  }
}

export function bookingReducer(s: BookingState, a: BookingAction): BookingState {
  switch (a.type) {
    case 'SET_VEHICLE':  return { ...s, vehicle: a.vehicle }
    case 'SET_DATES':    return { ...s, ...a.patch }
    case 'SET_CUSTOMER': return { ...s, customer: a.customer }
    case 'GOTO':         return { ...s, step: a.step }
  }
}

/**
 * Calendar-day rental duration. Same-day (start === end) counts as 1 day;
 * each extra calendar day adds one. Returns null when dates are missing,
 * malformed, or end precedes start.
 */
export function computeDurationDays(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) return null
  const a = new Date(startDate + 'T00:00:00')
  const b = new Date(endDate + 'T00:00:00')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  if (diff < 0) return null
  return Math.max(1, diff)
}

/** French short date "lun. 12 mai" from a yyyy-mm-dd string. */
export function formatDateFr(d: string): string {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(dt)
}

/** French DZD amount with thin spaces. */
export function formatDZD(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ') + ' DZD'
}
