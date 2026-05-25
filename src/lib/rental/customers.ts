// ─────────────────────────────────────────────────────────────────────
// Rental customers — shared find-or-create helper.
// ─────────────────────────────────────────────────────────────────────
// Resolves a rental_customer by (showroom_id, phone), creating it when
// absent. Used by BOTH the booking-wizard prefill (server component) and
// the "RDV planifié" auto-schedule API route, so the logic lives once.
//
// Phone is expected already +213-normalized and trimmed by the caller.
// The UNIQUE(showroom_id, phone) race is handled by re-selecting after a
// failed insert. Never throws — returns null when no phone is given or the
// row can't be resolved/created (RLS-blocked, etc.).
// ─────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export type RentalCustomerRow = {
  id:               string
  full_name:        string
  phone:            string
  blacklisted:      boolean | null
  blacklist_reason: string | null
}

const CUSTOMER_COLS = 'id, full_name, phone, blacklisted, blacklist_reason'

/**
 * Find a rental_customer by (showroom, phone) or create it. Works with any
 * RLS-aware Supabase client (server component or API route). Returns the
 * row, or null when `phone` is empty or the row can't be resolved.
 */
export async function findOrCreateRentalCustomer(
  sb: SupabaseClient,
  showroomId: string,
  phone: string,
  name: string,
): Promise<RentalCustomerRow | null> {
  const p = (phone ?? '').trim()
  if (!p) return null
  const n = (name ?? '').trim()

  const { data: existing } = await sb
    .from('rental_customers')
    .select(CUSTOMER_COLS)
    .eq('showroom_id', showroomId)
    .eq('phone', p)
    .maybeSingle()
  if (existing) return existing as RentalCustomerRow

  const { data: inserted } = await sb
    .from('rental_customers')
    .insert([{ showroom_id: showroomId, full_name: n || p, phone: p }])
    .select(CUSTOMER_COLS)
    .maybeSingle()
  if (inserted) return inserted as RentalCustomerRow

  // UNIQUE(showroom, phone) race (or insert blocked) → re-select.
  const { data: again } = await sb
    .from('rental_customers')
    .select(CUSTOMER_COLS)
    .eq('showroom_id', showroomId)
    .eq('phone', p)
    .maybeSingle()
  return (again as RentalCustomerRow | null) ?? null
}
