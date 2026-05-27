// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/rentals/[id]/reserve
// ─────────────────────────────────────────────────────────────────────
// "Réserver" a draft contract: records ONE financial commitment and moves
// draft → confirmed. The bare draft→confirmed PATCH was removed, so a
// reservation ALWAYS goes through here.
//
// Body: { mode, amount, method, reference?, notes?, receipt_path? }
//   mode   ∈ 'acompte' | 'caution'
//   method ∈ 'cash' | 'ccp' | 'baridimob' | 'bank_transfer'
//
// Mode mapping:
//   • 'acompte' — avance loyer. Target = ceil(deposit_min_percent% of
//                 total_rental_amount). Payment recorded as type='rental_payment'
//                 (counts against the rent in the finance section).
//   • 'caution' — garantie voiture. Target = rentals.deposit_amount (the
//                 vehicle's security caution, seeded at contract creation).
//                 Payment recorded as type='deposit'.
//
// Receipt photo:
//   • method !== 'cash' → receipt_path REQUIRED. Path must start with
//     `{ctx.showroomId}/rentals/{rentalId}/` (path-tampering guard;
//     storage RLS already seals the showroom prefix).
//   • method === 'cash' → receipt_path ignored, receipt_url stored as NULL.
//
// FINANCIAL action → owner/manager/super_admin only (mirrors the payments
// guard; closers don't take money in this system).
//
// SAFE ORDER (no DB transaction available):
//   1. overlap re-check (exclude self) → 409 BEFORE any money is taken,
//   2. insert the payment (with receipt_url when present),
//   3. flip draft → confirmed (guarded with .eq('status','draft')).
// If step 3 fails, the just-inserted payment is rolled back so we never
// keep money on a non-confirmed contract.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum, rentalMinDeposit, RENTAL_MIN_DEPOSIT_PERCENT_FLOOR } from '@/components/rental/booking/types'
import { insertRentalPayment, RENTAL_PAYMENT_METHOD_SET } from '@/lib/rental/create-payment'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const FIN_ROLES = new Set(['owner', 'manager', 'super_admin'])
const MODES     = new Set(['acompte', 'caution'])

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!FIN_ROLES.has(ctx.role)) {
      throw new ApiError(403, 'Seul un responsable peut réserver (enregistrer la caution).')
    }

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const mode = String(body.mode ?? '')
    if (!MODES.has(mode)) {
      throw new ApiError(400, "mode invalide (attendu 'acompte' ou 'caution').")
    }
    const method = String(body.method ?? '')
    if (!RENTAL_PAYMENT_METHOD_SET.has(method)) {
      throw new ApiError(400, 'Méthode de paiement invalide.')
    }
    const reference = body.reference ? String(body.reference).slice(0, 120) : null
    const notes     = body.notes ? String(body.notes).slice(0, 500) : null

    // ── Receipt photo: required iff non-cash, with strict prefix guard ──
    let receiptPath: string | null = null
    if (method !== 'cash') {
      const raw = body.receipt_path ? String(body.receipt_path).trim() : ''
      if (!raw) throw new ApiError(400, 'Photo du reçu obligatoire pour ce mode de paiement.')
      const expectedPrefix = `${ctx.showroomId}/rentals/${id}/`
      if (!raw.startsWith(expectedPrefix)) {
        throw new ApiError(400, 'Chemin du reçu invalide.')
      }
      receiptPath = raw
    }
    // Cash → no receipt; ignore any client-sent receipt_path.

    // ── Load + scope ───────────────────────────────────────────
    const { data: rental, error: loadErr } = await ctx.authSb
      .from('rentals')
      .select('id, showroom_id, status, rental_vehicle_id, start_date, end_date, total_rental_amount, deposit_amount')
      .eq('id', id)
      .maybeSingle()
    if (loadErr) throw new ApiError(500, loadErr.message)
    if (!rental) throw new ApiError(404, 'Contrat introuvable.')
    if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Contrat hors de votre showroom.')
    }
    // Chantier 1: any "À-confirmer" sub-status can be reserved (draft +
    // tentative_1/2/3 + reporter). The deposit-recorded transition flips to
    // 'confirmed' regardless of which sub-bucket the lead was in.
    if (!['draft', 'tentative_1', 'tentative_2', 'tentative_3', 'reporter'].includes(rental.status)) {
      throw new ApiError(409, 'Seul un contrat « À confirmer » peut être réservé.')
    }

    // ── Amount ─────────────────────────────────────────────────
    const amt = Math.round(toNum(body.amount))
    if (!(amt > 0)) throw new ApiError(400, 'Montant invalide.')

    // ── Mode-specific target + payment type ────────────────────
    let paymentType: 'rental_payment' | 'deposit'
    if (mode === 'acompte') {
      // Per-showroom minimum deposit % (migration_47); 5% fallback.
      const { data: settings } = await ctx.authSb
        .from('rental_settings')
        .select('deposit_min_percent')
        .eq('showroom_id', rental.showroom_id)
        .maybeSingle()
      const rawPct = Number(settings?.deposit_min_percent ?? RENTAL_MIN_DEPOSIT_PERCENT_FLOOR)
      const pct = Number.isFinite(rawPct)
        ? Math.min(100, Math.max(RENTAL_MIN_DEPOSIT_PERCENT_FLOOR, rawPct))
        : RENTAL_MIN_DEPOSIT_PERCENT_FLOOR
      const total = toNum(rental.total_rental_amount)
      const minTarget = rentalMinDeposit(total, pct)
      if (amt < minTarget) {
        throw new ApiError(400, `L'acompte doit être au moins ${pct}% du total (${minTarget} DZD).`)
      }
      paymentType = 'rental_payment'
    } else {
      const cautionTarget = Math.max(0, Math.round(toNum(rental.deposit_amount)))
      if (amt < cautionTarget) {
        throw new ApiError(400, `La caution doit couvrir la caution voiture (${cautionTarget} DZD).`)
      }
      paymentType = 'deposit'
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

    // ── 2) Record the payment (with receipt_url when present) ──
    const payment = await insertRentalPayment(ctx.authSb, {
      rentalId:   id,
      type:       paymentType,
      amount:     amt,
      method,
      reference,
      notes,
      receiptUrl: receiptPath,
      createdBy:  ctx.user.id,
    })

    // ── 3) Flip draft → confirmed (guarded against concurrent change) ──
    const { data: updated, error: updErr } = await ctx.authSb
      .from('rentals')
      .update({ status: 'confirmed' })
      .eq('id', id)
      .in('status', ['draft', 'tentative_1', 'tentative_2', 'tentative_3', 'reporter'])
      .select('id, contract_number, status')
      .maybeSingle()

    if (updErr || !updated) {
      // Roll back the just-inserted payment so we never keep money on a
      // non-confirmed contract (rare: the row left 'draft' between load and update).
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
