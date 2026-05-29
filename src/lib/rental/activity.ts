// ─────────────────────────────────────────────────────────────────────
// Rental activity log — shared best-effort insert helper (Chantier 3).
// ─────────────────────────────────────────────────────────────────────
// One place to append a who/when/what row to rental_activities (migration
// 50). Called server-side after a successful rental mutation by the create
// / reserve / pickup / report / payment / status-suivi / vehicle-change /
// dates-edit / cancel routes.
//
// BEST-EFFORT by contract: this NEVER throws. A logging failure must never
// fail the user action it trails — on any error we console.error and
// swallow. Pass the caller's RLS-aware client (ctx.authSb) so the
// rental_activities_insert WITH CHECK (own showroom / own contract) passes.
// ─────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export type RentalActivityType =
  | 'created' | 'status_change' | 'reserved' | 'picked_up' | 'reported'
  | 'vehicle_changed' | 'dates_changed' | 'payment' | 'cancelled'

export type LogRentalActivityInput = {
  showroomId: string
  rentalId:   string
  actorId:    string | null
  type:       RentalActivityType
  title:      string
  body?:      string | null
}

/**
 * Append one rental_activities row. Best-effort: logs and swallows on
 * failure, NEVER throws. Use the authenticated client at call sites so the
 * insert RLS policy (own showroom / own contract) is satisfied.
 */
export async function logRentalActivity(
  sb: SupabaseClient,
  a: LogRentalActivityInput,
): Promise<void> {
  try {
    const { error } = await sb.from('rental_activities').insert([{
      showroom_id: a.showroomId,
      rental_id:   a.rentalId,
      actor_id:    a.actorId,
      type:        a.type,
      title:       a.title,
      body:        a.body ?? null,
    }])
    if (error) console.error('[logRentalActivity] failed (best-effort):', error)
  } catch (err) {
    console.error('[logRentalActivity] failed (best-effort):', err)
  }
}
