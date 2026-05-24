// ─────────────────────────────────────────────────────────────────────
// Rental payments — shared vocabulary + finance categories.
// ─────────────────────────────────────────────────────────────────────
// Single source of truth for rental_payments.type / .method labels and the
// category groupings used by the contract finance math. Codes mirror the
// CHECK constraints in migration_37_rental_module_schema.sql.
//
// Finance categories:
//   • LOYER   → 'rental_payment'                       (rent installments)
//   • CAUTION → 'deposit' (held) / 'refund' (returned) (NOT revenue)
//   • FRAIS   → extra_charge / km_excess / late_fee /
//               damage_fee / fuel_charge                (additional revenue)
// ─────────────────────────────────────────────────────────────────────

export type RentalPaymentType =
  | 'deposit' | 'rental_payment' | 'extra_charge' | 'refund'
  | 'km_excess' | 'late_fee' | 'damage_fee' | 'fuel_charge'

export type RentalPaymentMethod = 'cash' | 'ccp' | 'baridimob' | 'bank_transfer'

// Order chosen for the add-payment selector (most common first).
export const RENTAL_PAYMENT_TYPES: { code: RentalPaymentType; label: string }[] = [
  { code: 'rental_payment', label: 'Paiement loyer' },
  { code: 'deposit',        label: 'Caution' },
  { code: 'extra_charge',   label: 'Frais divers' },
  { code: 'km_excess',      label: 'Km supplémentaire' },
  { code: 'late_fee',       label: 'Pénalité de retard' },
  { code: 'damage_fee',     label: 'Dommages' },
  { code: 'fuel_charge',    label: 'Carburant' },
  { code: 'refund',         label: 'Remboursement' },
]

export const RENTAL_PAYMENT_METHODS: { code: RentalPaymentMethod; label: string }[] = [
  { code: 'cash',          label: 'Espèces' },
  { code: 'ccp',           label: 'CCP' },
  { code: 'baridimob',     label: 'BaridiMob' },
  { code: 'bank_transfer', label: 'Virement' },
]

export const RENTAL_PAYMENT_TYPE_CODES: RentalPaymentType[] = RENTAL_PAYMENT_TYPES.map((t) => t.code)
export const RENTAL_PAYMENT_METHOD_CODES: RentalPaymentMethod[] = RENTAL_PAYMENT_METHODS.map((m) => m.code)

// ── Finance categories ──────────────────────────────────────────────
export const RENT_PAYMENT_TYPE   = 'rental_payment' as const
export const DEPOSIT_PAYMENT_TYPE = 'deposit' as const
export const REFUND_PAYMENT_TYPE  = 'refund' as const
export const EXTRA_FEE_TYPES: RentalPaymentType[] = [
  'extra_charge', 'km_excess', 'late_fee', 'damage_fee', 'fuel_charge',
]
const EXTRA_SET = new Set<string>(EXTRA_FEE_TYPES)
/** True for the "additional revenue" fee types (not rent, not deposit/refund). */
export function isExtraFeeType(type: string): boolean {
  return EXTRA_SET.has(type)
}

export function rentalPaymentTypeLabel(code: string): string {
  return RENTAL_PAYMENT_TYPES.find((t) => t.code === code)?.label ?? code
}
export function rentalPaymentMethodLabel(code: string): string {
  return RENTAL_PAYMENT_METHODS.find((m) => m.code === code)?.label ?? code
}
