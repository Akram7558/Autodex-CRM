// ─────────────────────────────────────────────────────────────────────
// /api/rental/vehicles/:id
//   GET    — single vehicle
//   PATCH  — update (owner / manager only)
//   DELETE — soft-delete (is_active=false). Hard delete is attempted
//            first; on FK violation from existing rentals we fall back
//            to a soft delete so historical contracts stay intact.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const FUEL_TYPES = ['essence', 'diesel', 'hybride', 'electrique', 'gpl'] as const
const BOX_TYPES  = ['manuelle', 'automatique'] as const
const FUEL_LEVELS = ['empty', '1/4', '1/2', '3/4', 'full'] as const

function asNumber(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function validatePatch(body: unknown): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (b.marque !== undefined)          out.marque = String(b.marque).trim()
  if (b.modele !== undefined)          out.modele = String(b.modele).trim()
  if (b.annee  !== undefined) {
    const n = asNumber(b.annee)
    if (n == null || !Number.isInteger(n) || n < 1980 || n > 2100) {
      throw new ApiError(400, 'Année invalide.')
    }
    out.annee = n
  }
  if (b.immatriculation !== undefined) out.immatriculation = String(b.immatriculation).trim()
  if (b.couleur !== undefined)         out.couleur = b.couleur ? String(b.couleur).trim() : null
  if (b.type_carburant !== undefined) {
    const v = b.type_carburant ? String(b.type_carburant) : null
    if (v && !FUEL_TYPES.includes(v as never)) throw new ApiError(400, 'Carburant invalide.')
    out.type_carburant = v
  }
  if (b.boite_vitesse !== undefined) {
    const v = b.boite_vitesse ? String(b.boite_vitesse) : null
    if (v && !BOX_TYPES.includes(v as never)) throw new ApiError(400, 'Boîte invalide.')
    out.boite_vitesse = v
  }
  if (b.fuel_level !== undefined) {
    const v = b.fuel_level ? String(b.fuel_level) : null
    if (v && !FUEL_LEVELS.includes(v as never)) throw new ApiError(400, 'Niveau carburant invalide.')
    out.fuel_level = v
  }
  if (b.nb_places !== undefined)            out.nb_places = asNumber(b.nb_places)
  if (b.description !== undefined)          out.description = b.description ? String(b.description).trim() : null
  if (b.daily_rate !== undefined) {
    const n = asNumber(b.daily_rate)
    if (n == null || n < 0) throw new ApiError(400, 'Tarif journalier invalide.')
    out.daily_rate = n
  }
  if (b.weekly_rate !== undefined)          out.weekly_rate = asNumber(b.weekly_rate)
  if (b.monthly_rate !== undefined)         out.monthly_rate = asNumber(b.monthly_rate)
  if (b.deposit_amount !== undefined)       out.deposit_amount = asNumber(b.deposit_amount) ?? 0
  if (b.km_included_per_day !== undefined)  out.km_included_per_day = asNumber(b.km_included_per_day)
  if (b.extra_km_rate !== undefined)        out.extra_km_rate = asNumber(b.extra_km_rate)
  if (b.current_km !== undefined)           out.current_km = asNumber(b.current_km)
  if (b.is_active !== undefined)            out.is_active = !!b.is_active
  if (b.photos_urls !== undefined) {
    out.photos_urls = Array.isArray(b.photos_urls)
      ? (b.photos_urls as unknown[]).filter((u) => typeof u === 'string').map(String)
      : []
  }

  return out
}

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    let q = ctx.authSb.from('rental_vehicles').select('*').eq('id', id)
    if (ctx.showroomId) q = q.eq('showroom_id', ctx.showroomId)
    const { data, error } = await q.maybeSingle()
    if (error) throw new ApiError(500, error.message)
    if (!data) throw new ApiError(404, 'Véhicule introuvable.')
    return NextResponse.json({ vehicle: data })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─── PATCH ─────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (ctx.role !== 'owner' && ctx.role !== 'manager' && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Seul un Owner ou un Manager peut modifier un véhicule.')
    }
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')
    const updates = validatePatch(await req.json().catch(() => ({})))
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'Aucun champ à mettre à jour.')
    }

    const { data, error } = await ctx.authSb
      .from('rental_vehicles')
      .update(updates)
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
      .select('*')
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Cette immatriculation existe déjà.' }, { status: 409 })
      }
      throw new ApiError(400, error.message)
    }
    if (!data) throw new ApiError(404, 'Véhicule introuvable.')
    return NextResponse.json({ vehicle: data })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─── DELETE ────────────────────────────────────────────────────────
// Hard delete is attempted first. If a vehicle is already linked to
// any rental row, the ON DELETE RESTRICT FK kicks in (Postgres code
// 23503) — we fall back to a soft delete so historical contracts
// stay intact and the vehicle no longer counts against the Classique
// cap.

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (ctx.role !== 'owner' && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Seul un Owner peut supprimer un véhicule.')
    }
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const { error: delErr } = await ctx.authSb
      .from('rental_vehicles')
      .delete()
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)

    if (delErr) {
      if (delErr.code === '23503') {
        // Soft delete fallback.
        const { error: softErr } = await ctx.authSb
          .from('rental_vehicles')
          .update({ is_active: false })
          .eq('id', id)
          .eq('showroom_id', ctx.showroomId)
        if (softErr) throw new ApiError(400, softErr.message)
        return NextResponse.json({ success: true, soft: true })
      }
      throw new ApiError(400, delErr.message)
    }

    return NextResponse.json({ success: true, soft: false })
  } catch (err) {
    return errorResponse(err)
  }
}
