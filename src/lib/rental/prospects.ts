// ─────────────────────────────────────────────────────────────────────
// Rental prospects — shared reason + status vocabulary.
// ─────────────────────────────────────────────────────────────────────
// Single source of truth for the rental-prospect reason codes and status
// labels, reused by the public request form (chunk B), the dashboard
// pipeline (chunk C), and the conversion flow (chunk D). Codes mirror the
// CHECK constraints in migration_44_rental_prospects.sql.
// ─────────────────────────────────────────────────────────────────────

export type RentalProspectReason =
  | 'mariage' | 'long_trajet' | 'professionnel' | 'remplacement'
  | 'tourisme' | 'evenement' | 'essai' | 'autre'

export const RENTAL_PROSPECT_REASONS: { code: RentalProspectReason; label: string }[] = [
  { code: 'mariage',       label: 'Mariage' },
  { code: 'long_trajet',   label: 'Long trajet' },
  { code: 'professionnel', label: 'Professionnel' },
  { code: 'remplacement',  label: 'Véhicule de remplacement' },
  { code: 'tourisme',      label: 'Tourisme' },
  { code: 'evenement',     label: 'Événement' },
  { code: 'essai',         label: 'Essai avant achat' },
  { code: 'autre',         label: 'Autre' },
]

export const RENTAL_PROSPECT_REASON_CODES: RentalProspectReason[] =
  RENTAL_PROSPECT_REASONS.map((r) => r.code)

const REASON_SET = new Set<string>(RENTAL_PROSPECT_REASON_CODES)
export function isRentalProspectReason(v: unknown): v is RentalProspectReason {
  return typeof v === 'string' && REASON_SET.has(v)
}
export function rentalProspectReasonLabel(code: string): string {
  return RENTAL_PROSPECT_REASONS.find((r) => r.code === code)?.label ?? code
}

export type RentalProspectStatus = 'nouvelle' | 'contactee' | 'convertie' | 'perdue'

export const RENTAL_PROSPECT_STATUSES: { code: RentalProspectStatus; label: string }[] = [
  { code: 'nouvelle',  label: 'Nouvelle demande' },
  { code: 'contactee', label: 'Contactée' },
  { code: 'convertie', label: 'Convertie' },
  { code: 'perdue',    label: 'Perdue' },
]
export function rentalProspectStatusLabel(code: string): string {
  return RENTAL_PROSPECT_STATUSES.find((s) => s.code === code)?.label ?? code
}
