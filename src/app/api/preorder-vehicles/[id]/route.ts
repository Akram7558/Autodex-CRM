// ─────────────────────────────────────────────────────────────────────
// /api/preorder-vehicles/[id]
//   PATCH  — partial update
//   DELETE — remove
// owner / manager / super_admin only. Tenant scoping happens via RLS
// on the underlying table; we still set `eq('showroom_id', ...)` as
// defense-in-depth.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}

    if (body.marque !== undefined) {
      const v = String(body.marque).trim()
      if (!v) return NextResponse.json({ error: 'Marque requise.' }, { status: 400 })
      updates.marque = v
    }
    if (body.modele !== undefined) {
      const v = String(body.modele).trim()
      if (!v) return NextResponse.json({ error: 'Modèle requis.' }, { status: 400 })
      updates.modele = v
    }
    if (body.annee !== undefined) {
      const a = body.annee == null || body.annee === '' ? null : Number(body.annee)
      if (a !== null && (!Number.isInteger(a) || a < 1900 || a > 2100)) {
        return NextResponse.json({ error: 'Année invalide.' }, { status: 400 })
      }
      updates.annee = a
    }
    if (body.prix_estime !== undefined) {
      const p = body.prix_estime == null || body.prix_estime === '' ? null : Number(body.prix_estime)
      if (p !== null && (!Number.isFinite(p) || p < 0)) {
        return NextResponse.json({ error: 'Prix estimé invalide.' }, { status: 400 })
      }
      updates.prix_estime = p
    }
    if (body.description     !== undefined) updates.description     = body.description     ? String(body.description).trim()     : null
    if (body.image_url       !== undefined) updates.image_url       = body.image_url       ? String(body.image_url).trim()       : null
    if (body.delai_livraison !== undefined) updates.delai_livraison = body.delai_livraison ? String(body.delai_livraison).trim() : null
    if (body.disponible      !== undefined) updates.disponible      = !!body.disponible

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 })
    }

    const { data, error } = await ctx.authSb
      .from('preorder_vehicles')
      .update(updates)
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
      .select('*')
      .single()
    if (error) throw new ApiError(400, error.message)
    if (!data)  throw new ApiError(404, 'Pré-commande introuvable.')
    return NextResponse.json({ preorder: data })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const { error } = await ctx.authSb
      .from('preorder_vehicles')
      .delete()
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
    if (error) throw new ApiError(400, error.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
