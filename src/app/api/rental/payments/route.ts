// ─────────────────────────────────────────────────────────────────────
// POST /api/rental/payments
// ─────────────────────────────────────────────────────────────────────
// Records a payment against a rental. Body:
//   { rental_id, type, amount, method, reference?, notes? }
//   type   ∈ deposit | rental_payment | extra_charge | refund | km_excess
//            | late_fee | damage_fee | fuel_charge   (migration_37 CHECK)
//   method ∈ cash | ccp | baridimob | bank_transfer  (migration_37 CHECK)
//
// Financial action → restricted to owner/manager/super_admin (closers
// don't see/record money, mirroring the contract financials guard). The
// parent rental must be in the caller's showroom. created_at is the
// payment date (no separate paid_at column).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum } from '@/components/rental/booking/types'
import {
  insertRentalPayment, RENTAL_PAYMENT_TYPE_SET, RENTAL_PAYMENT_METHOD_SET,
} from '@/lib/rental/create-payment'

export const runtime = 'nodejs'

const FIN_ROLES = new Set(['owner', 'manager', 'super_admin'])

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!FIN_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const rentalId  = String(body.rental_id ?? '')
    const type      = String(body.type ?? '')
    const method    = String(body.method ?? '')
    const amount    = toNum(body.amount)
    const reference = body.reference ? String(body.reference).slice(0, 120) : null
    const notes     = body.notes ? String(body.notes).slice(0, 500) : null

    if (!rentalId) throw new ApiError(400, 'rental_id requis.')
    if (!RENTAL_PAYMENT_TYPE_SET.has(type)) throw new ApiError(400, 'Type de paiement invalide.')
    if (!RENTAL_PAYMENT_METHOD_SET.has(method)) throw new ApiError(400, 'Méthode de paiement invalide.')
    if (!(amount > 0)) throw new ApiError(400, 'Montant invalide.')

    // Verify the parent rental is in the caller's showroom (RLS-scoped).
    const { data: rental, error: rErr } = await ctx.authSb
      .from('rentals').select('id, showroom_id').eq('id', rentalId).maybeSingle()
    if (rErr) throw new ApiError(500, rErr.message)
    if (!rental) throw new ApiError(404, 'Contrat introuvable.')
    if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Contrat hors de votre showroom.')
    }

    const data = await insertRentalPayment(ctx.authSb, {
      rentalId, type, amount, method, reference, notes, createdBy: ctx.user.id,
    })

    return NextResponse.json({ payment: data }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
