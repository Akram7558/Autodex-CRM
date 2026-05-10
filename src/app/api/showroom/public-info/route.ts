// ─────────────────────────────────────────────────────────────────────
// /api/showroom/public-info
//   GET  — read the caller's own showroom public profile
//   PUT  — update the public profile (slug excluded — auto-generated)
// owner / manager / super_admin only.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import { tryNormalizePhone } from '@/lib/phone'
import type { ShowroomOpeningHours } from '@/lib/types'

export const runtime = 'nodejs'

const PUBLIC_FIELDS =
  'id, name, slug, city, phone, whatsapp, address, google_maps_url, logo_url, opening_hours, catalog_enabled'

// Defensive validator for the opening_hours JSONB. Accepts only the 7
// French weekday keys; coerces values to strings; drops anything else.
const VALID_DAYS: (keyof ShowroomOpeningHours)[] = [
  'lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche',
]
function sanitizeOpeningHours(input: unknown): ShowroomOpeningHours | null {
  if (!input || typeof input !== 'object') return null
  const out: ShowroomOpeningHours = {}
  for (const key of VALID_DAYS) {
    const v = (input as Record<string, unknown>)[key]
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed) out[key] = trimmed
    }
  }
  return Object.keys(out).length ? out : null
}

// ── GET ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ctx.showroomId) {
      // super_admin without a showroom — return null so the UI can
      // surface a friendly empty state.
      return NextResponse.json({ showroom: null })
    }
    const { data, error } = await ctx.authSb
      .from('showrooms')
      .select(PUBLIC_FIELDS)
      .eq('id', ctx.showroomId)
      .maybeSingle()
    if (error) throw new ApiError(500, error.message)
    return NextResponse.json({ showroom: data ?? null })
  } catch (err) {
    return errorResponse(err)
  }
}

// ── PUT ─────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    const body = await req.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}

    if (body.phone !== undefined) {
      const v = String(body.phone).trim()
      updates.phone = v ? (tryNormalizePhone(v) ?? v) : null
    }
    if (body.whatsapp !== undefined) {
      const v = String(body.whatsapp).trim()
      updates.whatsapp = v ? (tryNormalizePhone(v) ?? v) : null
    }
    if (body.address          !== undefined) updates.address          = body.address          ? String(body.address).trim()          : null
    if (body.google_maps_url  !== undefined) updates.google_maps_url  = body.google_maps_url  ? String(body.google_maps_url).trim()  : null
    if (body.logo_url         !== undefined) updates.logo_url         = body.logo_url         ? String(body.logo_url).trim()         : null
    if (body.opening_hours    !== undefined) updates.opening_hours    = sanitizeOpeningHours(body.opening_hours)
    if (body.catalog_enabled  !== undefined) updates.catalog_enabled  = !!body.catalog_enabled

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 })
    }

    const { data, error } = await ctx.authSb
      .from('showrooms')
      .update(updates)
      .eq('id', ctx.showroomId)
      .select(PUBLIC_FIELDS)
      .single()
    if (error) throw new ApiError(400, error.message)
    return NextResponse.json({ showroom: data })
  } catch (err) {
    return errorResponse(err)
  }
}
