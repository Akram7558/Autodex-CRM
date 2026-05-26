// ─────────────────────────────────────────────────────────────────────
// Rental payments — shared server insert helper + validation sets.
// ─────────────────────────────────────────────────────────────────────
// One place to insert a rental_payment row, reused by:
//   • POST /api/rental/payments                  (manual payment entry)
//   • POST /api/rental/rentals/[id]/reserve      (mandatory deposit on Réserver)
// Codes mirror the CHECK constraints in migration_37_rental_module_schema.sql.
// ─────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api-auth'

export const RENTAL_PAYMENT_TYPE_SET = new Set<string>([
  'deposit', 'rental_payment', 'extra_charge', 'refund',
  'km_excess', 'late_fee', 'damage_fee', 'fuel_charge',
])
export const RENTAL_PAYMENT_METHOD_SET = new Set<string>([
  'cash', 'ccp', 'baridimob', 'bank_transfer',
])

export type RentalPaymentRow = {
  id: string
  type: string
  amount: number
  method: string
  reference: string | null
  notes: string | null
  receipt_url: string | null
  created_at: string
}

export type RentalPaymentInsert = {
  rentalId:    string
  type:        string
  amount:      number
  method:      string
  reference:   string | null
  notes:       string | null
  receiptUrl?: string | null    // private storage path; null/omit for cash
  createdBy:   string
}

/**
 * Insert one rental_payment with the caller's RLS-aware client. Throws
 * ApiError(400) on failure. Caller is responsible for auth/role + amount/
 * type/method validation (use the *_SET constants above).
 */
export async function insertRentalPayment(
  sb: SupabaseClient,
  p: RentalPaymentInsert,
): Promise<RentalPaymentRow> {
  const { data, error } = await sb
    .from('rental_payments')
    .insert([{
      rental_id:   p.rentalId,
      type:        p.type,
      amount:      p.amount,
      method:      p.method,
      reference:   p.reference,
      notes:       p.notes,
      receipt_url: p.receiptUrl ?? null,
      created_by:  p.createdBy,
    }])
    .select('id, type, amount, method, reference, notes, receipt_url, created_at')
    .single()
  if (error) throw new ApiError(400, error.message)
  return data as RentalPaymentRow
}
