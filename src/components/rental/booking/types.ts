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

export type DiscountType = 'amount' | 'percent'

export type BookingState = {
  step:      1 | 2 | 3 | 4
  vehicle:   RentalVehicleLite | null
  startDate: string   // yyyy-mm-dd
  endDate:   string   // yyyy-mm-dd
  startTime: string   // HH:mm
  endTime:   string   // HH:mm
  customer:  RentalCustomerLite | null
  // ── chunk 2: pricing + signature ──────────────────────────────
  discountType:     DiscountType
  discountValue:    number
  depositAmount:    number
  notes:            string
  signatureDataUrl: string | null
}

export type BookingAction =
  | { type: 'SET_VEHICLE';  vehicle: RentalVehicleLite | null }
  | { type: 'SET_DATES';    patch: Partial<Pick<BookingState, 'startDate' | 'endDate' | 'startTime' | 'endTime'>> }
  | { type: 'SET_CUSTOMER'; customer: RentalCustomerLite | null }
  | { type: 'SET_PRICING';  patch: Partial<Pick<BookingState, 'discountType' | 'discountValue' | 'depositAmount' | 'notes'>> }
  | { type: 'SET_SIGNATURE'; dataUrl: string | null }
  | { type: 'GOTO';         step: BookingState['step'] }
  | { type: 'RESET' }

/**
 * Coerce a possibly-string numeric (Supabase returns `numeric` columns as
 * strings) to a finite number, falling back to 0 for null/undefined/NaN.
 */
export function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function initialBookingState(): BookingState {
  return {
    step:      1,
    vehicle:   null,
    startDate: '',
    endDate:   '',
    startTime: '09:00',
    endTime:   '18:00',
    customer:  null,
    discountType:     'amount',
    discountValue:    0,
    depositAmount:    0,
    notes:            '',
    signatureDataUrl: null,
  }
}

export function bookingReducer(s: BookingState, a: BookingAction): BookingState {
  switch (a.type) {
    // Seed the deposit from the chosen vehicle's default caution. Supabase
    // returns `numeric` columns as STRINGS, so coerce — `?? 0` alone keeps
    // a string and breaks downstream Number.isFinite checks.
    case 'SET_VEHICLE':  return { ...s, vehicle: a.vehicle, depositAmount: toNum(a.vehicle?.deposit_amount) }
    case 'SET_DATES':    return { ...s, ...a.patch }
    case 'SET_CUSTOMER': return { ...s, customer: a.customer }
    case 'SET_PRICING':  return { ...s, ...a.patch }
    case 'SET_SIGNATURE': return { ...s, signatureDataUrl: a.dataUrl }
    case 'GOTO':         return { ...s, step: a.step }
    case 'RESET':        return initialBookingState()
  }
}

// ── Prospect → wizard prefill (chunk D) ───────────────────────────────
// Built server-side from a rental_prospect; seeds the wizard's initial
// state. `customer` is the find-or-created rental_customer (auto-resolved by
// phone on convert) — when set, Step 2 is already satisfied. customerName/
// Phone are still passed to StepCustomer to prime the search/create form if
// the employee overrides the auto-selected client.
export type WizardPrefill = {
  fromProspectId:     string
  vehicle:            RentalVehicleLite | null
  vehicleUnavailable: boolean   // prospect referenced a vehicle that's gone/inactive
  startDate:          string
  endDate:            string
  customer:           RentalCustomerLite | null
  customerName:       string
  customerPhone:      string
}

/** Seed BookingState from a prefill (or the empty default when null). */
export function bookingStateFromPrefill(p: WizardPrefill | null): BookingState {
  const base = initialBookingState()
  if (!p) return base
  return {
    ...base,
    vehicle:       p.vehicle,
    depositAmount: p.vehicle ? toNum(p.vehicle.deposit_amount) : base.depositAmount,
    startDate:     p.startDate || '',
    endDate:       p.endDate || '',
    customer:      p.customer ?? null,
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

/**
 * Pricing math — pure, used by both the UI (step 3/4) and re-derived
 * server-side at insert (the client total is never trusted).
 *   basePrice      = dailyRate × durationDays
 *   discountAmount = percent ? round(base × value/100) : value, clamp 0..base
 *   total          = max(0, base − discountAmount)
 */
export function computeDiscountAmount(basePrice: number, type: DiscountType, value: number): number {
  if (!Number.isFinite(value) || value <= 0 || basePrice <= 0) return 0
  const raw = type === 'percent' ? basePrice * (value / 100) : value
  return Math.max(0, Math.min(basePrice, Math.round(raw)))
}

export function computePricing(
  dailyRate: number | null | undefined,
  durationDays: number | null,
  type: DiscountType,
  value: number,
): { basePrice: number; discountAmount: number; total: number } {
  const basePrice = Math.max(0, Math.round((dailyRate ?? 0) * (durationDays ?? 0)))
  const discountAmount = computeDiscountAmount(basePrice, type, value)
  const total = Math.max(0, basePrice - discountAmount)
  return { basePrice, discountAmount, total }
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

// ─────────────────────────────────────────────────────────────────────
// Rental status — user-facing French labels.
// ─────────────────────────────────────────────────────────────────────
// SINGLE source of truth for how a rental status is shown to users. The
// DB enum/strings are unchanged (draft/confirmed/active/completed/
// cancelled/overdue) — this only maps them to display text. Change labels
// here and every badge/tab updates.

// 'reporter' = contract whose start/RDV is postponed (date à revoir). It is
// excluded from overlap/agenda/active-KPIs by design (those count only
// confirmed/active/overdue) — a postponed contract doesn't block its vehicle.
export type RentalStatus =
  | 'draft' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'overdue' | 'reporter'

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  draft:     'À confirmer',
  confirmed: 'Réservé — à venir',
  active:    'En cours de location',
  completed: 'Terminé — Rendu',
  overdue:   'En retard',
  cancelled: 'Annulé',
  reporter:  'Reporté',
}

/** Display label for a rental status value (falls back to the raw value). */
export function rentalStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return RENTAL_STATUS_LABELS[status as RentalStatus] ?? status
}

// Centralized status badge colors (single source of truth — used by the
// contracts list + the contract detail). 'reporter' = violet (distinct from
// overdue's amber).
export const RENTAL_STATUS_COLORS: Record<RentalStatus, { bg: string; fg: string; ring: string }> = {
  draft:     { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8', ring: 'rgba(148,163,184,0.35)' },
  confirmed: { bg: 'rgba(59,130,246,0.12)',  fg: '#60a5fa', ring: 'rgba(59,130,246,0.35)' },
  active:    { bg: 'rgba(16,185,129,0.14)',  fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  completed: { bg: 'rgba(16,185,129,0.14)',  fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  overdue:   { bg: 'rgba(245,158,11,0.14)',  fg: '#fbbf24', ring: 'rgba(245,158,11,0.40)' },
  cancelled: { bg: 'rgba(244,63,94,0.12)',   fg: '#fb7185', ring: 'rgba(244,63,94,0.40)' },
  reporter:  { bg: 'rgba(168,85,247,0.14)',  fg: '#c084fc', ring: 'rgba(168,85,247,0.40)' },
}

/** Color set for a rental status (falls back to draft's neutral tone). */
export function rentalStatusColor(status: string | null | undefined): { bg: string; fg: string; ring: string } {
  return RENTAL_STATUS_COLORS[status as RentalStatus] ?? RENTAL_STATUS_COLORS.draft
}

// Contracts-list tab grouping. Each status maps to exactly one tab; reporter
// has its own "Reportés" tab. Kept here as the single source of truth.
export const RENTAL_TAB_GROUPS: { key: string; label: string; statuses: RentalStatus[] }[] = [
  { key: 'pending',   label: 'À confirmer', statuses: ['draft'] },
  { key: 'upcoming',  label: 'À venir',     statuses: ['confirmed'] },
  { key: 'ongoing',   label: 'En cours',    statuses: ['active', 'overdue'] },
  { key: 'postponed', label: 'Reportés',    statuses: ['reporter'] },
  { key: 'completed', label: 'Terminés',    statuses: ['completed'] },
  { key: 'cancelled', label: 'Annulés',     statuses: ['cancelled'] },
]
