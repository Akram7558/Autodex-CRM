// ─────────────────────────────────────────────────────────────────────
// GET /api/leads/:id/temperature-history
// ─────────────────────────────────────────────────────────────────────
// Owner / manager only. Returns up to the last 30 entries (oldest first
// so the sparkline reads left → right). Tenant isolation: verifies the
// lead's showroom matches the caller's.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'

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

export async function GET(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const admin = adminClient()

    // Tenant isolation: ensure the lead belongs to the caller's showroom.
    if (!ctx.isSuperAdmin && ctx.showroomId) {
      const { data: lead, error: leadErr } = await admin
        .from('leads')
        .select('id, showroom_id')
        .eq('id', id)
        .maybeSingle()
      if (leadErr) throw new ApiError(500, leadErr.message)
      if (!lead || lead.showroom_id !== ctx.showroomId) {
        throw new ApiError(404, 'Lead introuvable.')
      }
    }

    const { data, error } = await admin
      .from('lead_temperature_history')
      .select('score, temperature, recorded_at')
      .eq('lead_id', id)
      .order('recorded_at', { ascending: false })
      .limit(30)
    if (error) throw new ApiError(500, error.message)

    // Reverse so the UI gets oldest → newest (left to right).
    const history = (data ?? []).slice().reverse()
    return NextResponse.json({ history })
  } catch (err) {
    return errorResponse(err)
  }
}
