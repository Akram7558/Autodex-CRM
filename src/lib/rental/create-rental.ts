// ─────────────────────────────────────────────────────────────────────
// Rental creation — shared core (contract_number + resilient insert + link).
// ─────────────────────────────────────────────────────────────────────
// The fiddly bits of creating a rental row are reused by TWO flows:
//   • POST /api/rental/rentals               (booking wizard, step 4)
//   • POST /api/rental/prospects/[id]/schedule ("RDV planifié" auto-draft)
// so they live here instead of being duplicated.
//
// insertRentalWithContractNumber:
//   generates a per-showroom LOC-YYYY-NNNN number (no DB sequence exists,
//   the column has a GLOBAL UNIQUE) and inserts, bumping NNNN + retrying on
//   a 23505 collision, and degrading gracefully if the signature_url column
//   is absent (migration 43 not run). Throws ApiError(400) if all fail.
//
// linkProspectToRental:
//   best-effort link of an originating rental_prospect to a fresh rental —
//   sets converted_rental_id + status, scoped to the showroom, ONLY when the
//   prospect isn't already linked (converted_rental_id IS NULL). Never
//   throws: a failed/no-match link must never fail the rental creation.
// ─────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api-auth'

/** The validated, server-derived rental row minus contract_number/signature. */
export type RentalInsertCore = {
  showroom_id:         string
  rental_vehicle_id:   string
  customer_id:         string
  assigned_to:         string
  created_by:          string
  start_date:          string
  start_time:          string
  end_date:            string
  end_time:            string
  duration_days:       number
  daily_rate_snapshot: number
  total_rental_amount: number
  deposit_amount:      number
  status:              'draft'
  notes:               string | null
}

export async function insertRentalWithContractNumber(
  authSb: SupabaseClient,
  core: RentalInsertCore,
  opts?: { signaturePath?: string | null; signedAt?: string | null },
): Promise<{ id: string; contract_number: string }> {
  const signaturePath = opts?.signaturePath ?? null
  const signedAt = opts?.signedAt ?? null

  const year = new Date().getFullYear()
  const { count } = await authSb
    .from('rentals')
    .select('id', { count: 'exact', head: true })
    .eq('showroom_id', core.showroom_id)
    .gte('created_at', `${year}-01-01`)

  let seq = (count ?? 0) + 1
  let includeSignature = !!signaturePath
  let lastErr: { code?: string; message?: string } | null = null

  for (let attempt = 0; attempt < 12; attempt++) {
    const contractNumber = `LOC-${year}-${String(seq).padStart(4, '0')}`
    const row: Record<string, unknown> = { ...core, contract_number: contractNumber }
    if (signaturePath) row.signed_at = signedAt
    if (includeSignature) row.signature_url = signaturePath

    const { data, error } = await authSb
      .from('rentals')
      .insert([row])
      .select('id, contract_number')
      .single()

    if (!error) {
      return { id: data.id as string, contract_number: data.contract_number as string }
    }
    lastErr = error

    // contract_number already taken (global UNIQUE) → bump and retry.
    if (error.code === '23505') { seq += 1; continue }

    // signature_url column absent (migration 43 not run) → drop it, keep
    // signed_at, retry the same number.
    const msg = (error.message ?? '').toLowerCase()
    if (includeSignature && (error.code === '42703' || error.code === 'PGRST204' || msg.includes('signature_url'))) {
      includeSignature = false
      continue
    }
    break
  }

  throw new ApiError(400, lastErr?.message ?? 'Création du contrat échouée.')
}

/**
 * Best-effort link of an originating rental_prospect to a freshly-created
 * rental. Returns whether a row was linked. Never throws.
 */
export async function linkProspectToRental(
  authSb: SupabaseClient,
  prospectId: string,
  showroomId: string,
  rentalId: string,
  status: 'rdv_planifie' | 'convertie',
): Promise<boolean> {
  try {
    const { data, error } = await authSb
      .from('rental_prospects')
      .update({ status, converted_rental_id: rentalId })
      .eq('id', prospectId)
      .eq('showroom_id', showroomId)
      .is('converted_rental_id', null)
      .select('id')
      .maybeSingle()
    return !error && !!data
  } catch {
    return false
  }
}
