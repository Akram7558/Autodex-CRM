// ─────────────────────────────────────────────────────────────────────
// /api/rental/rentals/[id]/report
// ─────────────────────────────────────────────────────────────────────
// "Reporter" a rental — set new dates (times optional), recompute
// duration_days + total_rental_amount, and flip the status to 'reporter'.
//
// confirmed→reporter, draft→reporter and overdue→reporter were removed
// from the generic PATCH (TRANSITIONS no longer accepts 'reporter' from
// any of those states) so a reschedule ALWAYS goes through here and
// ALWAYS uses the new dates (mirrors how draft→confirmed lives in
// /reserve and confirmed→active in /pickup).
//
// Role guard: same as the previous PATCH "reporter" permission —
// owner/manager/super_admin + closer-on-own. NO financial gating
// (just a date change).
//
// Conflict warning is NON-BLOCKING by design. A reported contract is
// excluded from check_rental_overlap (status NOT IN confirmed/active/
// overdue), so a conflict means an OTHER rental is already booked there;
// the user is informed but the reschedule still goes through (the
// reported contract doesn't block its vehicle).
//
// GET  → current rental row (status, dates, times, duration, daily_rate
//        snapshot, total), used to prefill the popup.
// POST → body { start_date, end_date, start_time?, end_time? }.
//        Returns { rental, warning: { had_conflict, conflicts? } }.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum, computeDurationDays } from '@/components/rental/booking/types'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const REPORTABLE   = new Set(['draft', 'confirmed', 'overdue'])
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/
const TIME_RX = /^\d{2}:\d{2}$/

async function loadReportable(
  ctx: Awaited<ReturnType<typeof requireShowroomMember>>,
  id: string,
  requireReportable: boolean,
) {
  const { data: rental, error } = await ctx.authSb
    .from('rentals')
    .select('id, showroom_id, status, assigned_to, contract_number, rental_vehicle_id, start_date, end_date, start_time, end_time, duration_days, daily_rate_snapshot, total_rental_amount')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!rental) throw new ApiError(404, 'Contrat introuvable.')
  if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
    throw new ApiError(403, 'Contrat hors de votre showroom.')
  }
  if (ctx.role === 'closer' && rental.assigned_to !== ctx.user.id) {
    throw new ApiError(403, 'Vous ne pouvez modifier que vos propres contrats.')
  }
  if (requireReportable && !REPORTABLE.has(String(rental.status))) {
    throw new ApiError(409, 'Ce contrat ne peut pas être reporté depuis son état actuel.')
  }
  return rental as {
    id: string; showroom_id: string; status: string; assigned_to: string | null
    contract_number: string | null
    rental_vehicle_id: string
    start_date: string; end_date: string; start_time: string; end_time: string
    duration_days: unknown; daily_rate_snapshot: unknown; total_rental_amount: unknown
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET — prefill the ReportDialog.
// ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const r = await loadReportable(ctx, id, true)
    return NextResponse.json({
      status:              r.status,
      rental_vehicle_id:   r.rental_vehicle_id,
      start_date:          r.start_date,
      end_date:            r.end_date,
      start_time:          r.start_time,
      end_time:            r.end_time,
      duration_days:       toNum(r.duration_days),
      daily_rate_snapshot: toNum(r.daily_rate_snapshot),
      total_rental_amount: toNum(r.total_rental_amount),
    })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST — new dates → recompute total → flip status to 'reporter'.
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const rental = await loadReportable(ctx, id, true)

    // ── Body validation ────────────────────────────────────────
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const newStart = String(body.start_date ?? '')
    const newEnd   = String(body.end_date ?? '')
    if (!DATE_RX.test(newStart)) throw new ApiError(400, 'Date de début invalide.')
    if (!DATE_RX.test(newEnd))   throw new ApiError(400, 'Date de fin invalide.')
    if (newEnd < newStart) {
      throw new ApiError(400, 'La date de fin doit être postérieure ou égale au début.')
    }

    const dur = computeDurationDays(newStart, newEnd)
    if (dur == null || dur <= 0) throw new ApiError(400, 'Durée invalide.')

    // Recompute total from the frozen daily_rate_snapshot (the loueur is
    // already committed to this rate). Mirrors POST /api/rental/rentals.
    const dailyRate = toNum(rental.daily_rate_snapshot)
    const newTotal  = Math.max(0, Math.round(dailyRate * dur))

    const updates: Record<string, unknown> = {
      start_date:          newStart,
      end_date:             newEnd,
      duration_days:        dur,
      total_rental_amount:  newTotal,
      status:               'reporter',
    }
    if (body.start_time !== undefined) {
      const t = String(body.start_time)
      if (t && !TIME_RX.test(t)) throw new ApiError(400, 'Heure de début invalide.')
      if (t) updates.start_time = t
    }
    if (body.end_time !== undefined) {
      const t = String(body.end_time)
      if (t && !TIME_RX.test(t)) throw new ApiError(400, 'Heure de fin invalide.')
      if (t) updates.end_time = t
    }

    // ── Non-blocking conflict warning ──────────────────────────
    // The reported contract is itself excluded from check_rental_overlap
    // (status filter), but we still pass p_exclude_rental_id defensively
    // so the call is correct even before the flip lands.
    let hadConflict = false
    let conflicts: { start_date: string; end_date: string }[] | undefined
    const { data: overlap } = await ctx.authSb.rpc('check_rental_overlap', {
      p_vehicle_id:        rental.rental_vehicle_id,
      p_start:             newStart,
      p_end:               newEnd,
      p_exclude_rental_id: id,
    })
    if (overlap === true) {
      hadConflict = true
      const { data: conflictRows } = await ctx.authSb
        .from('rentals')
        .select('start_date, end_date')
        .eq('rental_vehicle_id', rental.rental_vehicle_id)
        .in('status', ['confirmed', 'active', 'overdue'])
        .lte('start_date', newEnd)
        .gte('end_date', newStart)
        .neq('id', id)
        .order('start_date', { ascending: true })
      conflicts = (conflictRows ?? []).map((c) => ({
        start_date: c.start_date as string,
        end_date:   c.end_date as string,
      }))
    }

    // ── Update (single-shot, guarded against concurrent state change) ──
    const { data: updated, error: updErr } = await ctx.authSb
      .from('rentals')
      .update(updates)
      .eq('id', id)
      .in('status', ['draft', 'confirmed', 'overdue'])
      .select('id, contract_number, status, start_date, end_date, start_time, end_time, duration_days, total_rental_amount')
      .maybeSingle()
    if (updErr) throw new ApiError(400, updErr.message)
    if (!updated) throw new ApiError(409, "Le contrat a changé d'état pendant l'opération.")

    return NextResponse.json(
      { rental: updated, warning: { had_conflict: hadConflict, ...(conflicts ? { conflicts } : {}) } },
      { status: 201 },
    )
  } catch (err) {
    return errorResponse(err)
  }
}
