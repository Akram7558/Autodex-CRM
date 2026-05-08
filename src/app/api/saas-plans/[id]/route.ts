// ─────────────────────────────────────────────────────────────────────
// DELETE /api/saas-plans/[id]
// ─────────────────────────────────────────────────────────────────────
// Soft delete — flips `active` to false. We never hard-delete because
// converted showrooms may still reference the plan via showrooms.plan_id,
// and even with ON DELETE SET NULL we want to preserve the historical
// pricing/duration record.
// super_admin only.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin, errorResponse } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    await requireSuperAdmin(req)
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Service role key missing.' }, { status: 500 })
    }
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    const { error } = await admin
      .from('saas_plans')
      .update({ active: false })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
