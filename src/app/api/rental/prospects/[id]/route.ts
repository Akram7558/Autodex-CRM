// ─────────────────────────────────────────────────────────────────────
// PATCH /api/rental/prospects/[id]
// ─────────────────────────────────────────────────────────────────────
// Suivi status changes for a rental prospect (public rental request).
// Body: { status }.
//
// FREE movement among the selectable suivi states (mirrors the sales
// dropdown): nouvelle, tentative_1, tentative_2, tentative_3, reporter,
// rdv_planifie, perdue → any of them.
//   • 'convertie' is REJECTED here (409) — it's machine-set only by the
//     convert-to-contract flow (chunk D).
//   • Any value outside the selectable set → 400.
//
// Permissions: requireShowroomMember; prospect must be in the caller's
// showroom (showroom_id scoped — RLS already enforces it for owner/
// manager/closer; super_admin bypasses).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { RENTAL_PROSPECT_SUIVI_SET } from '@/lib/rental/prospects'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const target = String(body.status ?? '')

    // Real conversion (status='convertie' + converted_rental_id) is done by
    // the convert flow in chunk D, never here.
    if (target === 'convertie') {
      throw new ApiError(409, 'La conversion en contrat se fait via « Convertir en contrat ».')
    }
    // Free movement among the suivi statuses (mirrors the sales free-form
    // dropdown). Anything outside the selectable set is rejected.
    if (!RENTAL_PROSPECT_SUIVI_SET.has(target)) {
      throw new ApiError(400, 'status invalide.')
    }

    const { data: prospect, error: loadErr } = await ctx.authSb
      .from('rental_prospects')
      .select('id, showroom_id, status')
      .eq('id', id)
      .maybeSingle()
    if (loadErr) throw new ApiError(500, loadErr.message)
    if (!prospect) throw new ApiError(404, 'Demande introuvable.')
    if (!ctx.isSuperAdmin && prospect.showroom_id !== ctx.showroomId) {
      throw new ApiError(403, 'Demande hors de votre showroom.')
    }

    const { data, error } = await ctx.authSb
      .from('rental_prospects')
      .update({ status: target })
      .eq('id', id)
      .select('id, status')
      .maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!data) throw new ApiError(404, 'Demande introuvable.')

    return NextResponse.json({ prospect: data })
  } catch (err) {
    return errorResponse(err)
  }
}
