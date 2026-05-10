// ─────────────────────────────────────────────────────────────────────
// /api/showroom/public-info
//   GET  — read the caller's own showroom public profile
//   PUT  — update the public profile (slug excluded — auto-generated)
// owner / manager / super_admin only.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import { tryNormalizePhone } from '@/lib/phone'
import type { ShowroomOpeningHours } from '@/lib/types'

export const runtime = 'nodejs'

// Service-role client. Auth is enforced upstream by `requireShowroomAdmin`
// (verifies the caller is owner/manager of `ctx.showroomId`); we still
// scope every query by id so service-role can't be used to read or write
// another tenant's row.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

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
    // Use service-role here too — caller is already authenticated as an
    // admin of this showroom_id, and we scope with `.eq('id', ...)`. This
    // avoids any GET/PUT mismatch where reads work via anon RLS but the
    // matching write doesn't.
    const admin = adminClient()
    const { data, error } = await admin
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

    // Service-role write. Tenant RLS on `showrooms` may not grant UPDATE
    // to owner/manager roles — but the caller is already proven to be an
    // admin of this showroom by `requireShowroomAdmin`, and we scope with
    // `.eq('id', ctx.showroomId)`, so this is safe.
    //
    // Use `.maybeSingle()` (not `.single()`) on the read-back so we don't
    // throw "Cannot coerce the result to a single JSON object" on the
    // edge case where the row vanishes mid-request — we'll return a
    // proper 404 instead.
    const admin = adminClient()
    const { data, error } = await admin
      .from('showrooms')
      .update(updates)
      .eq('id', ctx.showroomId)
      .select(PUBLIC_FIELDS)
      .maybeSingle()
    if (error) {
      console.error('[public-info PUT] supabase error:', error)
      throw new ApiError(400, error.message)
    }
    if (!data) {
      throw new ApiError(404, 'Showroom introuvable.')
    }
    return NextResponse.json({ showroom: data })
  } catch (err) {
    return errorResponse(err)
  }
}
