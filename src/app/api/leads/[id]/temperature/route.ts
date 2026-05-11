// ─────────────────────────────────────────────────────────────────────
// PATCH /api/leads/:id/temperature
// ─────────────────────────────────────────────────────────────────────
// Owner / manager only. Lets the owner manually pin a lead's temperature
// bucket. Setting any value flips `manual_temperature_override = true`
// so the auto recalc trigger / batch refresh skip this row from now on.
//
// Body: { manual_temperature: 'chaud' | 'tiede' | 'froid' | null }
//   • non-null → set temperature, lock override
//   • null     → clear override, restore auto recalc, recompute on the
//                  spot so the row shows fresh values right away
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import type { LeadTemperature } from '@/lib/types'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const SCORE_FOR: Record<LeadTemperature, number> = {
  chaud: 85,
  tiede: 55,
  froid: 25,
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const incoming = body?.manual_temperature
    const value: LeadTemperature | null =
      incoming === 'chaud' || incoming === 'tiede' || incoming === 'froid'
        ? incoming
        : incoming === null
          ? null
          : (() => { throw new ApiError(400, 'manual_temperature invalide.') })()

    const admin = adminClient()

    if (value === null) {
      // Clear override + recompute on the spot.
      const { data: calc, error: calcErr } = await admin
        .rpc('calculate_lead_temperature', { p_lead_id: id })
      if (calcErr) throw new ApiError(500, calcErr.message)
      const row = Array.isArray(calc) ? calc[0] : calc
      const score = (row?.score ?? 50) as number
      const temp  = (row?.temp  ?? 'tiede') as LeadTemperature

      const { data, error } = await admin
        .from('leads')
        .update({
          manual_temperature_override: false,
          temperature_score: score,
          temperature: temp,
          temperature_updated_at: new Date().toISOString(),
          froid_since: temp === 'froid' ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .eq('showroom_id', ctx.showroomId)
        .select('id, temperature, temperature_score, manual_temperature_override')
        .maybeSingle()
      if (error) throw new ApiError(400, error.message)
      if (!data)  throw new ApiError(404, 'Lead introuvable.')
      return NextResponse.json({ lead: data })
    }

    // Manual pin.
    const { data, error } = await admin
      .from('leads')
      .update({
        temperature: value,
        temperature_score: SCORE_FOR[value],
        manual_temperature_override: true,
        temperature_updated_at: new Date().toISOString(),
        froid_since: value === 'froid' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
      .select('id, temperature, temperature_score, manual_temperature_override')
      .maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!data)  throw new ApiError(404, 'Lead introuvable.')
    return NextResponse.json({ lead: data })
  } catch (err) {
    return errorResponse(err)
  }
}
