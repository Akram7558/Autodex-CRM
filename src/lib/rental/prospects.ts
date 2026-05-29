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

// Sales-like "suivi" model (migration_45). NOTE: code 'perdue' is kept in
// the DB but DISPLAYED as "Annulée" (label-only). 'convertie' is terminal
// and machine-set by the convert-to-contract flow (chunk D), exactly like
// the sales 'vendu' — never offered in the per-row dropdown.
export type RentalProspectStatus =
  | 'nouvelle' | 'tentative_1' | 'tentative_2' | 'tentative_3'
  | 'reporter' | 'rdv_planifie' | 'convertie' | 'perdue'

export const RENTAL_PROSPECT_STATUSES: { code: RentalProspectStatus; label: string }[] = [
  { code: 'nouvelle',     label: 'Nouvelle demande' },
  { code: 'tentative_1',  label: 'Tentative 1' },
  { code: 'tentative_2',  label: 'Tentative 2' },
  { code: 'tentative_3',  label: 'Tentative 3' },
  { code: 'reporter',     label: 'Reporter' },
  { code: 'rdv_planifie', label: 'RDV planifié' },
  { code: 'convertie',    label: 'Convertie' },
  { code: 'perdue',       label: 'Annulée' },
]
export function rentalProspectStatusLabel(code: string): string {
  return RENTAL_PROSPECT_STATUSES.find((s) => s.code === code)?.label ?? code
}

// Statuses selectable in the per-row "relance" dropdown. Both 'convertie'
// (machine-set) and 'rdv_planifie' are EXCLUDED: rdv_planifie is no longer a
// suivi state but a dedicated ACTION (a row button that moves the prospect
// into Contrats via /api/rental/prospects/[id]/schedule — Chantier 5).
export const RENTAL_PROSPECT_SUIVI_OPTIONS: RentalProspectStatus[] = [
  'nouvelle', 'tentative_1', 'tentative_2', 'tentative_3', 'reporter', 'perdue',
]

// Valid targets for the PATCH endpoint (manual moves). Excludes 'convertie'
// and 'rdv_planifie' — both are set by dedicated flows, never the dropdown.
export const RENTAL_PROSPECT_SUIVI_SET = new Set<string>(RENTAL_PROSPECT_SUIVI_OPTIONS)

// Color classes per status, mirroring the sales palette
// (LEAD_SUIVI_BADGE_CLASSES): tentative_1 yellow → tentative_2 orange →
// tentative_3 red, reporter amber, rdv_planifie / convertie emerald.
export const RENTAL_PROSPECT_SUIVI_BADGE_CLASSES: Record<RentalProspectStatus, string> = {
  nouvelle:     'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  tentative_1:  'bg-yellow-300 text-yellow-900 border-yellow-400 dark:bg-yellow-400 dark:text-yellow-950 dark:border-yellow-500',
  tentative_2:  'bg-orange-500 text-white border-orange-600 dark:bg-orange-500 dark:text-white dark:border-orange-600',
  tentative_3:  'bg-red-600 text-white border-red-700 dark:bg-red-600 dark:text-white dark:border-red-700',
  reporter:     'bg-orange-700 text-white border-orange-800 dark:bg-orange-700 dark:text-white dark:border-orange-800',
  rdv_planifie: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600 dark:text-white dark:border-emerald-700',
  convertie:    'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600 dark:text-white dark:border-emerald-700',
  perdue:       'bg-slate-500 text-white border-slate-600 dark:bg-slate-600 dark:text-white dark:border-slate-700',
}

// NOTE: the pipeline UI uses a single status filter (RentalProspectsList), not
// coarse tabs. rdv_planifie + convertie prospects are excluded from the list
// server-side, so the visible set is nouvelle / tentative_1-3 / reporter /
// perdue. (Cancelling a contract reopens its prospect to rdv_planifie — which,
// under the current filter, keeps it hidden from this pipeline.)

// Phone helper mirroring the sales formatPhoneIntl (module-local there, so
// re-implemented here). Rental phones are already +213-normalized.
//   tel: "+digits" (for tel:/sms:)   wa: "digits" (for wa.me)
export function rentalFormatPhoneIntl(raw: string | null | undefined): { tel: string; wa: string } | null {
  if (!raw) return null
  let s = raw.trim().replace(/[^\d+]/g, '')
  if (!s) return null
  if (s.startsWith('+')) {
    const digits = s.slice(1)
    return digits ? { tel: `+${digits}`, wa: digits } : null
  }
  if (s.startsWith('00')) s = s.slice(2)
  if (s.startsWith('0')) s = s.slice(1)
  const digits = s.startsWith('213') ? s : `213${s}`
  return digits ? { tel: `+${digits}`, wa: digits } : null
}
