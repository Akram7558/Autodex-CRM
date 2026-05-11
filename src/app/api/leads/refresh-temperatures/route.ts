// ─────────────────────────────────────────────────────────────────────
// POST /api/leads/refresh-temperatures
// ─────────────────────────────────────────────────────────────────────
// Owner / manager only. Calls the `refresh_lead_temperatures(uuid)`
// PL/pgSQL function for the caller's showroom — recomputes every
// non-closed, non-overridden lead in one round trip.
//
// Rate limit: once per 5 minutes per showroom (in-memory bucket per
// lambda instance). On hit, returns 429 with the remaining cooldown.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'

export const runtime = 'nodejs'

const WINDOW_MS = 5 * 60 * 1000
const cooldown = new Map<string, number>()

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    const now = Date.now()
    const last = cooldown.get(ctx.showroomId) ?? 0
    if (now - last < WINDOW_MS) {
      const remaining = Math.ceil((WINDOW_MS - (now - last)) / 1000)
      return NextResponse.json(
        { error: `Trop fréquent. Réessayez dans ${remaining}s.`, retry_in_seconds: remaining },
        { status: 429 },
      )
    }
    cooldown.set(ctx.showroomId, now)

    const admin = adminClient()
    const { data, error } = await admin.rpc('refresh_lead_temperatures', {
      p_showroom_id: ctx.showroomId,
    })
    if (error) throw new ApiError(500, error.message)

    return NextResponse.json({
      updated: typeof data === 'number' ? data : 0,
      refreshed_at: new Date().toISOString(),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
