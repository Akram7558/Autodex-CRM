// ─────────────────────────────────────────────────────────────────────
// /api/preorder-vehicles
//   GET   — list all preorders for the caller's showroom
//   POST  — create a new preorder
// owner / manager / super_admin only.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }

    let q = ctx.authSb
      .from('preorder_vehicles')
      .select('*')
      .order('created_at', { ascending: false })
    if (ctx.showroomId) q = q.eq('showroom_id', ctx.showroomId)

    const { data, error } = await q
    if (error) throw new ApiError(500, error.message)
    return NextResponse.json({ preorders: data ?? [] })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    const body = await req.json().catch(() => ({}))
    const marque = String(body.marque ?? '').trim()
    const modele = String(body.modele ?? '').trim()
    if (!marque) return NextResponse.json({ error: 'Marque requise.' }, { status: 400 })
    if (!modele) return NextResponse.json({ error: 'Modèle requis.' }, { status: 400 })

    const annee       = body.annee != null && body.annee !== '' ? Number(body.annee) : null
    if (annee !== null && (!Number.isInteger(annee) || annee < 1900 || annee > 2100)) {
      return NextResponse.json({ error: 'Année invalide.' }, { status: 400 })
    }
    const prix_estime = body.prix_estime != null && body.prix_estime !== '' ? Number(body.prix_estime) : null
    if (prix_estime !== null && (!Number.isFinite(prix_estime) || prix_estime < 0)) {
      return NextResponse.json({ error: 'Prix estimé invalide.' }, { status: 400 })
    }
    const description     = body.description     ? String(body.description).trim()     : null
    const image_url       = body.image_url       ? String(body.image_url).trim()       : null
    const delai_livraison = body.delai_livraison ? String(body.delai_livraison).trim() : null
    const disponible      = body.disponible !== false

    const { data, error } = await ctx.authSb
      .from('preorder_vehicles')
      .insert([{
        showroom_id: ctx.showroomId,
        marque,
        modele,
        annee,
        prix_estime,
        description,
        image_url,
        delai_livraison,
        disponible,
      }])
      .select('*')
      .single()
    if (error) throw new ApiError(400, error.message)
    return NextResponse.json({ preorder: data })
  } catch (err) {
    return errorResponse(err)
  }
}
