// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/availability
// ─────────────────────────────────────────────────────────────────────
// Booking-wizard availability check for one vehicle over a date range.
// Body: { rental_vehicle_id, start_date, end_date }  (dates AAAA-MM-JJ)
// Returns: { available: boolean, conflicts?: [{ start_date, end_date }] }
//
// Uses the SECURITY DEFINER RPC check_rental_overlap() (migration 39) as
// the authoritative answer — it counts only confirmed/active/overdue
// rentals, so drafts never block. The vehicle is first verified to belong
// to the caller's showroom (RLS-scoped read). When unavailable, the
// conflicting periods are fetched (RLS-scoped) for display.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const vehicleId = String(body.rental_vehicle_id ?? '')
    const start = String(body.start_date ?? '')
    const end   = String(body.end_date ?? '')
    // Optional: exclude one rental from the check (used by /report and any
    // future flow re-validating an existing rental's own dates). Backwards
    // compatible — omit and the behaviour is unchanged.
    const excludeId = body.exclude_rental_id ? String(body.exclude_rental_id).trim() : null

    if (!vehicleId) throw new ApiError(400, 'rental_vehicle_id requis.')
    if (!DATE_RX.test(start) || !DATE_RX.test(end)) {
      throw new ApiError(400, 'Dates invalides (format AAAA-MM-JJ).')
    }
    if (end < start) {
      throw new ApiError(400, 'La date de fin doit être postérieure ou égale au début.')
    }

    // Verify the vehicle belongs to the caller's showroom (RLS-scoped).
    const { data: veh, error: vehErr } = await ctx.authSb
      .from('rental_vehicles')
      .select('id, showroom_id')
      .eq('id', vehicleId)
      .maybeSingle()
    if (vehErr) throw new ApiError(500, vehErr.message)
    if (!veh) throw new ApiError(404, 'Véhicule introuvable.')
    if (!ctx.isSuperAdmin && veh.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Accès interdit à ce véhicule.')
    }

    // Authoritative overlap check (TRUE = conflict).
    const { data: overlap, error: rpcErr } = await ctx.authSb.rpc('check_rental_overlap', {
      p_vehicle_id: vehicleId,
      p_start: start,
      p_end: end,
      ...(excludeId ? { p_exclude_rental_id: excludeId } : {}),
    })
    if (rpcErr) throw new ApiError(500, rpcErr.message)

    if (overlap !== true) {
      return NextResponse.json({ available: true })
    }

    // Unavailable — fetch the conflicting periods for the UI (RLS-scoped).
    let cq = ctx.authSb
      .from('rentals')
      .select('start_date, end_date')
      .eq('rental_vehicle_id', vehicleId)
      .in('status', ['confirmed', 'active', 'overdue'])
      .lte('start_date', end)
      .gte('end_date', start)
      .order('start_date', { ascending: true })
    if (excludeId) cq = cq.neq('id', excludeId)
    const { data: conflicts } = await cq

    return NextResponse.json({
      available: false,
      conflicts: (conflicts ?? []).map((c) => ({
        start_date: c.start_date as string,
        end_date:   c.end_date as string,
      })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
