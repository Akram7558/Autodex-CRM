// ─────────────────────────────────────────────────────────────────────
// PATCH /api/rental/prospects/[id]
// ─────────────────────────────────────────────────────────────────────
// Status transitions for a rental prospect (public rental request). Body:
// { status }.
//
// Allowed transitions (server-validated; anything else → 400/409):
//   nouvelle  → contactee | perdue
//   contactee → convertie | perdue      (real conversion happens in chunk D;
//                                          this only allows the value)
//   perdue    → nouvelle                 (reopen)
//   convertie → terminal
//
// Permissions: requireShowroomMember; prospect must be in the caller's
// showroom (showroom_id scoped — RLS already enforces it for owner/
// manager/closer; super_admin bypasses).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const TRANSITIONS: Record<string, Set<string>> = {
  nouvelle:  new Set(['contactee', 'perdue']),
  contactee: new Set(['convertie', 'perdue']),
  perdue:    new Set(['nouvelle']),
  convertie: new Set(),
}

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
    if (!['nouvelle', 'contactee', 'convertie', 'perdue'].includes(target)) {
      throw new ApiError(400, "status invalide.")
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

    const current = String(prospect.status)
    if (current === target) {
      throw new ApiError(409, 'La demande est déjà dans ce statut.')
    }
    const allowed = TRANSITIONS[current] ?? new Set<string>()
    if (!allowed.has(target)) {
      throw new ApiError(409, `Transition non autorisée (${current} → ${target}).`)
    }
    // Real conversion (status='convertie' + converted_rental_id) is done by
    // the convert flow in chunk D, not here.
    if (target === 'convertie') {
      throw new ApiError(409, 'La conversion en contrat se fait via « Convertir en contrat ».')
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
