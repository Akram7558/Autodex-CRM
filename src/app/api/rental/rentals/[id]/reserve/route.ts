// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/rentals/[id]/reserve
// ─────────────────────────────────────────────────────────────────────
// "Réserver" a draft contract: records the MANDATORY deposit (caution) and
// moves draft → confirmed. The bare draft→confirmed PATCH was removed, so a
// reservation ALWAYS goes through here and ALWAYS records a deposit.
//
// Body: { deposit_amount, method, reference?, notes? }
//
// FINANCIAL action → owner/manager/super_admin only (mirrors the payments
// guard; closers don't take money in this system). The deposit must be at
// least 5% of total_rental_amount — re-validated here, never trusting the
// client.
//
// SAFE ORDER (no DB transaction available):
//   1. overlap re-check (exclude self) → 409 BEFORE any money is taken,
//   2. insert the deposit payment,
//   3. flip draft → confirmed (guarded with .eq('status','draft')).
// If step 3 fails (e.g. a concurrent status change), the just-inserted
// deposit is rolled back so we never keep money on a non-confirmed contract.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum, rentalMinDeposit } from '@/components/rental/booking/types'
import { insertRentalPayment, RENTAL_PAYMENT_METHOD_SET } from '@/lib/rental/create-payment'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const FIN_ROLES = new Set(['owner', 'manager', 'super_admin'])

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    // Reserving records money → financial roles only (like /api/rental/payments).
    if (!FIN_ROLES.has(ctx.role)) {
      throw new ApiError(403, 'Seul un responsable peut réserver (enregistrer la caution).')
    }

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const depositAmount = Math.round(toNum(body.deposit_amount))
    const method    = String(body.method ?? '')
    const reference = body.reference ? String(body.reference).slice(0, 120) : null
    const notes     = body.notes ? String(body.notes).slice(0, 500) : null
    if (!RENTAL_PAYMENT_METHOD_SET.has(method)) throw new ApiError(400, 'Méthode de paiement invalide.')

    // ── Load + scope ───────────────────────────────────────────
    const { data: rental, error: loadErr } = await ctx.authSb
      .from('rentals')
      .select('id, showroom_id, status, rental_vehicle_id, start_date, end_date, total_rental_amount')
      .eq('id', id)
      .maybeSingle()
    if (loadErr) throw new ApiError(500, loadErr.message)
    if (!rental) throw new ApiError(404, 'Contrat introuvable.')
    if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Contrat hors de votre showroom.')
    }
    if (rental.status !== 'draft') {
      throw new ApiError(409, 'Seul un contrat « à confirmer » peut être réservé.')
    }

    // ── 5% deposit floor (server-authoritative) ────────────────
    const total = toNum(rental.total_rental_amount)
    const minDeposit = rentalMinDeposit(total)
    if (!(depositAmount > 0)) throw new ApiError(400, 'Montant de la caution invalide.')
    if (depositAmount < minDeposit) {
      throw new ApiError(400, `Le dépôt doit être au moins 5% du total (${minDeposit} DZD).`)
    }

    // ── 1) Availability re-check FIRST (abort before taking money) ──
    const { data: overlap, error: rpcErr } = await ctx.authSb.rpc('check_rental_overlap', {
      p_vehicle_id: rental.rental_vehicle_id,
      p_start: rental.start_date,
      p_end: rental.end_date,
      p_exclude_rental_id: id,
    })
    if (rpcErr) throw new ApiError(500, rpcErr.message)
    if (overlap === true) {
      return NextResponse.json(
        { error: 'unavailable', message: 'Véhicule déjà réservé sur ces dates. Aucun paiement enregistré.' },
        { status: 409 },
      )
    }

    // ── 2) Record the deposit ──────────────────────────────────
    const payment = await insertRentalPayment(ctx.authSb, {
      rentalId: id, type: 'deposit', amount: depositAmount, method, reference, notes,
      createdBy: ctx.user.id,
    })

    // ── 3) Flip draft → confirmed (guarded against concurrent change) ──
    const { data: updated, error: updErr } = await ctx.authSb
      .from('rentals')
      .update({ status: 'confirmed' })
      .eq('id', id)
      .eq('status', 'draft')
      .select('id, contract_number, status')
      .maybeSingle()

    if (updErr || !updated) {
      // Roll back the deposit so we never keep money on a non-confirmed
      // contract (rare: the row left 'draft' between load and update).
      await ctx.authSb.from('rental_payments').delete().eq('id', payment.id)
      throw new ApiError(
        409,
        'La réservation a échoué (le contrat a changé de statut). Aucun paiement conservé.',
      )
    }

    return NextResponse.json({ rental: updated, payment }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
