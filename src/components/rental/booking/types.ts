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
//
// 'tentative_1/_2/_3' (Chantier 1 / migration_49) = relance sub-statuses
// under the "À confirmer" group (mirroring the prospects suivi vocabulary).
// All three behave EXACTLY like draft for overlap/agenda/KPIs/RLS — they're
// just narrower "À-confirmer" buckets for tracking how many times the loueur
// has tried to reach the client without payment.
export type RentalStatus =
  | 'draft' | 'tentative_1' | 'tentative_2' | 'tentative_3'
  | 'reporter' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'overdue'

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  draft:        'Nouvelle',
  tentative_1:  'Ne répond plus 1',
  tentative_2:  'Ne répond plus 2',
  tentative_3:  'Ne répond plus 3',
  reporter:     'Reporté',
  confirmed:    'Réservé',
  active:       'En cours de location',
  completed:    'Terminé — Rendu',
  overdue:      'En retard',
  cancelled:    'Annulé',
}

/** Display label for a rental status value (falls back to the raw value). */
export function rentalStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return RENTAL_STATUS_LABELS[status as RentalStatus] ?? status
}

// Centralized status badge colors (single source of truth — used by the
// contracts list + the contract detail). 'reporter' = violet (distinct from
// overdue's amber). 'tentative_1/2/3' = escalating yellow → orange → red,
// mirroring the prospects suivi palette (RENTAL_PROSPECT_SUIVI_BADGE_CLASSES).
export const RENTAL_STATUS_COLORS: Record<RentalStatus, { bg: string; fg: string; ring: string }> = {
  draft:        { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8', ring: 'rgba(148,163,184,0.35)' },
  tentative_1:  { bg: 'rgba(250,204,21,0.14)',  fg: '#facc15', ring: 'rgba(250,204,21,0.40)' },
  tentative_2:  { bg: 'rgba(251,146,60,0.14)',  fg: '#fb923c', ring: 'rgba(251,146,60,0.40)' },
  tentative_3:  { bg: 'rgba(239,68,68,0.14)',   fg: '#f87171', ring: 'rgba(239,68,68,0.45)'  },
  reporter:     { bg: 'rgba(168,85,247,0.14)',  fg: '#c084fc', ring: 'rgba(168,85,247,0.40)' },
  confirmed:    { bg: 'rgba(59,130,246,0.12)',  fg: '#60a5fa', ring: 'rgba(59,130,246,0.35)' },
  active:       { bg: 'rgba(16,185,129,0.14)',  fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  completed:    { bg: 'rgba(16,185,129,0.14)',  fg: '#10b981', ring: 'rgba(16,185,129,0.40)' },
  overdue:      { bg: 'rgba(245,158,11,0.14)',  fg: '#fbbf24', ring: 'rgba(245,158,11,0.40)' },
  cancelled:    { bg: 'rgba(244,63,94,0.12)',   fg: '#fb7185', ring: 'rgba(244,63,94,0.40)' },
}

/** Color set for a rental status (falls back to draft's neutral tone). */
export function rentalStatusColor(status: string | null | undefined): { bg: string; fg: string; ring: string } {
  return RENTAL_STATUS_COLORS[status as RentalStatus] ?? RENTAL_STATUS_COLORS.draft
}

// Contracts-list tab grouping. Each status maps to exactly one tab. NOTE
// (Chantier 1): the old "Reportés" tab is gone — 'reporter' now lives under
// the unified "À confirmer" tab alongside draft + tentative_1/2/3 (a postponed
// contract is just another unpaid lead, handled the same way).
export const RENTAL_TAB_GROUPS: { key: string; label: string; statuses: RentalStatus[] }[] = [
  { key: 'pending',   label: 'À confirmer', statuses: ['draft', 'tentative_1', 'tentative_2', 'tentative_3', 'reporter'] },
  { key: 'upcoming',  label: 'Réservés',    statuses: ['confirmed'] },
  { key: 'ongoing',   label: 'En cours',    statuses: ['active', 'overdue'] },
  { key: 'completed', label: 'Terminés',    statuses: ['completed'] },
  { key: 'cancelled', label: 'Annulés',     statuses: ['cancelled'] },
]

// ── À-confirmer suivi sub-statuses ────────────────────────────────────
// The 4 selectable values in the per-row SuiviControl (mirrors the prospects
// pipeline). 'reporter' is reached via /report (new dates required) — when
// the current status is 'reporter' it appears as a DISABLED head entry in
// the select so the user can move back to draft/tentative_X but can't
// "re-pick" it from the dropdown.
export const RENTAL_CONTRACT_SUIVI_OPTIONS: RentalStatus[] = [
  'draft', 'tentative_1', 'tentative_2', 'tentative_3',
]
export const RENTAL_CONTRACT_SUIVI_SET = new Set<string>(RENTAL_CONTRACT_SUIVI_OPTIONS)

/** Label for one of the 4 selectable suivi codes (delegates to rentalStatusLabel). */
export function rentalContractSuiviLabel(status: string): string {
  return rentalStatusLabel(status)
}

/**
 * True for statuses that render as an editable suivi <select> in the contracts
 * list/detail (the "À confirmer" group: draft + tentative_X + reporter).
 */
export function isContractPendingStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return RENTAL_CONTRACT_SUIVI_SET.has(status) || status === 'reporter'
}

// ── "RDV" badge ───────────────────────────────────────────────────────
// A contract that originated from a rental demande (prospect confirmed for
// an RDV — Chantier 4). Centralized so the contracts list and any future
// surface share the same wording.
export const RENTAL_FROM_PROSPECT_BADGE = 'RDV'
export const RENTAL_FROM_PROSPECT_TITLE = "Issu d'une demande de location"

// ── Lifecycle action labels ────────────────────────────────────────────
// Centralized so the contracts list + the contract detail share the wording.
// "Réserver"        = draft → confirmed (records the mandatory ≥5% deposit).
// "Voiture récupérée" = confirmed → active (the car is handed over).
export const RENTAL_ACTION_RESERVE = 'Réserver'
export const RENTAL_ACTION_PICKUP  = 'Voiture récupérée'

// Minimum deposit FRACTION fallback (5%) — used when the per-showroom
// percentage can't be loaded. The configurable value lives in
// rental_settings.deposit_min_percent (migration_47); both the UI and the
// reserve route fall back to this 5% floor if it's missing.
export const RENTAL_MIN_DEPOSIT_FRACTION = 0.05

// Hard floor (in whole percent) for the configurable minimum deposit. Mirrors
// the DB CHECK (deposit_min_percent >= 5) and the settings PATCH validation —
// the configured percent can never go below this.
export const RENTAL_MIN_DEPOSIT_PERCENT_FLOOR = 5

/**
 * Minimum deposit (caution) required to reserve: ceil(percent% of the total).
 * `percent` is a whole number (e.g. 5 / 10 / 20). It is clamped to
 * [RENTAL_MIN_DEPOSIT_PERCENT_FLOOR, 100]; when missing/invalid it falls back
 * to the 5% floor — so legacy zero-arg-ish callers keep the old behaviour.
 */
export function rentalMinDeposit(total: number | null | undefined, percent?: number | null): number {
  const t = typeof total === 'number' ? total : Number(total)
  if (!Number.isFinite(t) || t <= 0) return 0
  const p = typeof percent === 'number' ? percent : Number(percent)
  const pct = Number.isFinite(p)
    ? Math.min(100, Math.max(RENTAL_MIN_DEPOSIT_PERCENT_FLOOR, p))
    : RENTAL_MIN_DEPOSIT_PERCENT_FLOOR
  return Math.ceil(t * pct / 100)
}
