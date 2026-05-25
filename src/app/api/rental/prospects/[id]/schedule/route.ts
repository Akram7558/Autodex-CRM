// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/prospects/[id]/schedule
// ─────────────────────────────────────────────────────────────────────
// "RDV planifié" confirmation → MOVE the prospect into Contrats.
//
// Auth: requireShowroomMember; prospect in the caller's showroom; NOT
// already linked (converted_rental_id IS NULL) → else 409.
//
// Two outcomes:
//   A) The prospect already has everything needed (an ACTIVE vehicle in the
//      same showroom + valid desired_start/end dates, end ≥ start):
//      find-or-create the customer by phone, create a DRAFT rental REUSING
//      the shared creation core (server-derived pricing from the vehicle's
//      current daily_rate / deposit), link the prospect as
//      status='rdv_planifie' + converted_rental_id, and return
//      { mode:'created', rentalId }. Drafts don't block the vehicle, so
//      check_rental_overlap is NOT run here.
//   B) Missing vehicle or dates → set status='rdv_planifie' (best-effort,
//      stays in the pipeline, NOT linked yet) and return
//      { mode:'needs_wizard' }; the client opens the booking wizard
//      prefilled, which creates + links the contract on completion.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum, computeDurationDays } from '@/components/rental/booking/types'
import { findOrCreateRentalCustomer } from '@/lib/rental/customers'
import { insertRentalWithContractNumber, linkProspectToRental } from '@/lib/rental/create-rental'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    // ── Load + scope + not-already-linked ──────────────────────
    const { data: prospect, error: loadErr } = await ctx.authSb
      .from('rental_prospects')
      .select('id, showroom_id, status, rental_vehicle_id, full_name, phone, desired_start_date, desired_end_date, converted_rental_id')
      .eq('id', id)
      .maybeSingle()
    if (loadErr) throw new ApiError(500, loadErr.message)
    if (!prospect) throw new ApiError(404, 'Demande introuvable.')
    if (!ctx.isSuperAdmin && prospect.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Demande hors de votre showroom.')
    }
    if (prospect.converted_rental_id) {
      throw new ApiError(409, 'Cette demande est déjà liée à un contrat.')
    }

    const showroomId = String(prospect.showroom_id)
    const startDate  = String(prospect.desired_start_date ?? '')
    const endDate    = String(prospect.desired_end_date ?? '')
    const vehicleId  = String(prospect.rental_vehicle_id ?? '')
    const datesValid = DATE_RX.test(startDate) && DATE_RX.test(endDate) && endDate >= startDate

    // ── Resolve the vehicle (must exist, be active, same showroom) ──
    let veh: { daily_rate: unknown; deposit_amount: unknown } | null = null
    if (vehicleId) {
      const { data: v, error: vErr } = await ctx.authSb
        .from('rental_vehicles')
        .select('id, showroom_id, daily_rate, deposit_amount, is_active')
        .eq('id', vehicleId)
        .maybeSingle()
      if (vErr) throw new ApiError(500, vErr.message)
      if (v && v.is_active && v.showroom_id === showroomId) {
        veh = { daily_rate: v.daily_rate, deposit_amount: v.deposit_amount }
      }
    }

    // ── Outcome B: not enough to auto-create → open the wizard ──
    // Leave the prospect untouched here: the contract AND the prospect link
    // (status='rdv_planifie' + converted_rental_id) are applied by the
    // wizard's POST on completion. If the employee abandons the wizard the
    // prospect stays in the pipeline at its current status and can be retried.
    if (!veh || !datesValid) {
      return NextResponse.json({ mode: 'needs_wizard' })
    }

    // ── Outcome A: auto-create a DRAFT contract ────────────────
    const customer = await findOrCreateRentalCustomer(
      ctx.authSb, showroomId, String(prospect.phone ?? ''), String(prospect.full_name ?? ''),
    )
    if (!customer) throw new ApiError(400, 'Client introuvable ou impossible à créer.')

    const dur = computeDurationDays(startDate, endDate)
    if (dur == null) throw new ApiError(400, 'Durée invalide.')

    const dailyRate = toNum(veh.daily_rate)
    const total     = Math.max(0, Math.round(dailyRate * dur))
    const deposit   = Math.max(0, Math.round(toNum(veh.deposit_amount)))

    const { id: rentalId, contract_number } = await insertRentalWithContractNumber(ctx.authSb, {
      showroom_id:         showroomId,
      rental_vehicle_id:   vehicleId,
      customer_id:         customer.id,
      assigned_to:         ctx.user.id,
      created_by:          ctx.user.id,
      start_date:          startDate,
      start_time:          '09:00',
      end_date:            endDate,
      end_time:            '18:00',
      duration_days:       dur,
      daily_rate_snapshot: dailyRate,
      total_rental_amount: total,
      deposit_amount:      deposit,
      status:              'draft',
      notes:               null,
    })

    await linkProspectToRental(ctx.authSb, id, showroomId, rentalId, 'rdv_planifie')

    return NextResponse.json({ mode: 'created', rentalId, contract_number }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
