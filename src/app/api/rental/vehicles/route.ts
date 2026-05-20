// ─────────────────────────────────────────────────────────────────────
// /api/rental/vehicles
//   GET  — list active rental vehicles for the caller's showroom
//   POST — create (owner / manager only; closer denied)
// ─────────────────────────────────────────────────────────────────────
// Auth: requireShowroomMember (tenant scope) + per-op role check.
// Insertion goes through the anon-keyed `ctx.authSb` so the RLS
// policies (migration 38) plus the Classique 5-vehicle trigger
// (migration 39) both run.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

// ─── Validation helpers ────────────────────────────────────────────

const FUEL_TYPES = ['essence', 'diesel', 'hybride', 'electrique', 'gpl'] as const
const BOX_TYPES  = ['manuelle', 'automatique'] as const
const FUEL_LEVELS = ['empty', '1/4', '1/2', '3/4', 'full'] as const

type CreateBody = {
  marque:                string
  modele:                string
  annee:                 number
  immatriculation:       string
  couleur?:              string | null
  type_carburant?:       string | null
  boite_vitesse?:        string | null
  nb_places?:            number | null
  photos_urls?:          string[]
  description?:          string | null
  daily_rate:            number
  weekly_rate?:          number | null
  monthly_rate?:         number | null
  deposit_amount?:       number
  km_included_per_day?:  number | null
  extra_km_rate?:        number | null
  current_km?:           number | null
  fuel_level?:           string | null
}

function asNumber(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function validateCreate(body: unknown): CreateBody {
  const b = (body ?? {}) as Record<string, unknown>
  const marque = String(b.marque ?? '').trim()
  const modele = String(b.modele ?? '').trim()
  const annee = asNumber(b.annee)
  const immatriculation = String(b.immatriculation ?? '').trim()
  const daily_rate = asNumber(b.daily_rate)

  if (!marque) throw new ApiError(400, 'Marque requise.')
  if (!modele) throw new ApiError(400, 'Modèle requis.')
  if (annee == null || !Number.isInteger(annee) || annee < 1980 || annee > 2100) {
    throw new ApiError(400, 'Année invalide.')
  }
  if (!immatriculation) throw new ApiError(400, 'Immatriculation requise.')
  if (daily_rate == null || daily_rate < 0) {
    throw new ApiError(400, 'Tarif journalier invalide.')
  }

  const type_carburant = b.type_carburant ? String(b.type_carburant) : null
  if (type_carburant && !FUEL_TYPES.includes(type_carburant as never)) {
    throw new ApiError(400, 'Carburant invalide.')
  }
  const boite_vitesse = b.boite_vitesse ? String(b.boite_vitesse) : null
  if (boite_vitesse && !BOX_TYPES.includes(boite_vitesse as never)) {
    throw new ApiError(400, 'Boîte invalide.')
  }
  const fuel_level = b.fuel_level ? String(b.fuel_level) : null
  if (fuel_level && !FUEL_LEVELS.includes(fuel_level as never)) {
    throw new ApiError(400, 'Niveau carburant invalide.')
  }

  const photos = Array.isArray(b.photos_urls)
    ? (b.photos_urls as unknown[]).filter((u) => typeof u === 'string' && u.trim().length > 0).map(String)
    : []

  return {
    marque,
    modele,
    annee,
    immatriculation,
    couleur:             b.couleur ? String(b.couleur).trim() : null,
    type_carburant,
    boite_vitesse,
    nb_places:           asNumber(b.nb_places),
    photos_urls:         photos,
    description:         b.description ? String(b.description).trim() : null,
    daily_rate,
    weekly_rate:         asNumber(b.weekly_rate),
    monthly_rate:        asNumber(b.monthly_rate),
    deposit_amount:      asNumber(b.deposit_amount) ?? 0,
    km_included_per_day: asNumber(b.km_included_per_day),
    extra_km_rate:       asNumber(b.extra_km_rate),
    current_km:          asNumber(b.current_km),
    fuel_level,
  }
}

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // TEMP perf instrumentation — remove once the latency budget is tuned.
    const tAuth = performance.now()
    const ctx = await requireShowroomMember(req)
    console.log(`[perf] rental:api:vehicles:auth ${(performance.now() - tAuth).toFixed(0)}ms`)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }

    const search   = req.nextUrl.searchParams.get('search')?.trim() ?? ''
    const activeQS = req.nextUrl.searchParams.get('is_active')

    // select('*') is intentional: the rows feed the edit modal's initial
    // values, not just the cards. Bounded with limit(50) — pagination UI
    // can come later (fleets are small; Classique caps at 5).
    let q = ctx.authSb
      .from('rental_vehicles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (ctx.showroomId) q = q.eq('showroom_id', ctx.showroomId)
    if (activeQS === 'true')  q = q.eq('is_active', true)
    if (activeQS === 'false') q = q.eq('is_active', false)

    if (search) {
      const term = search.replace(/[%_]/g, '\\$&')
      q = q.or(
        `marque.ilike.%${term}%,modele.ilike.%${term}%,immatriculation.ilike.%${term}%`,
      )
    }

    const tQuery = performance.now()
    const { data, error } = await q
    console.log(`[perf] rental:api:vehicles:query ${(performance.now() - tQuery).toFixed(0)}ms`)
    if (error) throw new ApiError(500, error.message)
    return NextResponse.json({ vehicles: data ?? [] })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─── POST ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (ctx.role !== 'owner' && ctx.role !== 'manager' && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Seul un Owner ou un Manager peut ajouter un véhicule.')
    }

    const payload = validateCreate(await req.json().catch(() => ({})))

    const { data, error } = await ctx.authSb
      .from('rental_vehicles')
      .insert([{ ...payload, showroom_id: ctx.showroomId }])
      .select('*')
      .single()

    if (error) {
      // The migration-39 BEFORE INSERT trigger raises this when a
      // Classique showroom hits its 5-vehicle cap. Surface a typed
      // 403 so the client can open the upgrade modal cleanly.
      if (/CLASSIQUE_RENTAL_LIMIT_REACHED/i.test(error.message)) {
        return NextResponse.json(
          { error: 'plan_limit_reached', limit: 5 },
          { status: 403 },
        )
      }
      // Unique-violation on (showroom_id, immatriculation)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Cette immatriculation existe déjà.' },
          { status: 409 },
        )
      }
      throw new ApiError(400, error.message)
    }

    return NextResponse.json({ vehicle: data }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
