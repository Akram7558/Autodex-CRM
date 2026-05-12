// ─────────────────────────────────────────────────────────────────────
// DELETE /api/showroom/lead-distribution/:user_id
// ─────────────────────────────────────────────────────────────────────
// Removes an employee from the round-robin rotation. Owner / manager
// only; tenant-scoped via the caller's showroom_id.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ user_id: string }> }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    const { user_id } = await params
    if (!user_id) throw new ApiError(400, 'user_id requis.')

    const admin = adminClient()
    const { error } = await admin
      .from('showroom_lead_distribution')
      .delete()
      .eq('user_id', user_id)
      .eq('showroom_id', ctx.showroomId)
    if (error) throw new ApiError(400, error.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
