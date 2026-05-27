// ─────────────────────────────────────────────────────────────────────
// PATCH /api/rental/prospects/[id]
// ─────────────────────────────────────────────────────────────────────
// Update a rental prospect. Body fields (all optional, at least one
// required):
//   • status            — free movement among the suivi statuses; rejects
//                         'convertie' (machine-set only by the convert flow)
//                         and any value outside RENTAL_PROSPECT_SUIVI_SET.
//   • rental_vehicle_id — Chantier 2: change the prospect's requested car
//                         (or null to clear). Vehicle must exist + be in the
//                         caller's showroom + is_active.
//
// Permissions: requireShowroomMember; prospect must be in the caller's
// showroom (RLS already enforces it; super_admin bypasses).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { RENTAL_PROSPECT_SUIVI_SET } from '@/lib/rental/prospects'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    const updates: Record<string, unknown> = {}

    // ── status branch (existing behaviour) ─────────────────────
    if (body.status !== undefined) {
      const target = String(body.status ?? '')
      // Real conversion (status='convertie' + converted_rental_id) is done
      // by the convert flow only, never here.
      if (target === 'convertie') {
        throw new ApiError(409, 'La conversion en contrat se fait via « Convertir en contrat ».')
      }
      if (!RENTAL_PROSPECT_SUIVI_SET.has(target)) {
        throw new ApiError(400, 'status invalide.')
      }
      updates.status = target
    }

    // ── Load + scope (needed for both branches) ────────────────
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

    // ── vehicle change (Chantier 2) ────────────────────────────
    if (body.rental_vehicle_id !== undefined) {
      const raw = body.rental_vehicle_id
      if (raw === null) {
        updates.rental_vehicle_id = null
      } else {
        const vid = String(raw)
        if (!UUID_RX.test(vid)) throw new ApiError(400, 'rental_vehicle_id invalide.')
        const { data: veh, error: vErr } = await ctx.authSb
          .from('rental_vehicles')
          .select('id, showroom_id, is_active')
          .eq('id', vid)
          .maybeSingle()
        if (vErr) throw new ApiError(500, vErr.message)
        if (!veh) throw new ApiError(404, 'Véhicule introuvable.')
        if (!ctx.isSuperAdmin && veh.showroom_id !== ctx.showroomId) {
          throw new ApiError(403, 'Véhicule hors de votre showroom.')
        }
        if (!veh.is_active) throw new ApiError(400, 'Ce véhicule est inactif.')
        updates.rental_vehicle_id = vid
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'Aucun champ à mettre à jour.')
    }

    const { data, error } = await ctx.authSb
      .from('rental_prospects')
      .update(updates)
      .eq('id', id)
      .select('id, status, rental_vehicle_id, rental_vehicle:rental_vehicles(id, marque, modele, annee, immatriculation)')
      .maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!data) throw new ApiError(404, 'Demande introuvable.')

    return NextResponse.json({ prospect: data })
  } catch (err) {
    return errorResponse(err)
  }
}
