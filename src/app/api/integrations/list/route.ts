import { NextResponse, type NextRequest } from 'next/server'
import { supaServer } from '@/lib/integrations-utils'
import { requireShowroomMember, errorResponse } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/integrations/list[?showroom_id=…]
//
// Tenant users: returns integrations for THEIR showroom only — the
// `showroom_id` query param is ignored or must match their own.
// Super admins: with a `showroom_id` they get a single showroom's rows;
// without it, the entire integrations table (admin overview).
export async function GET(req: NextRequest) {
  let ctx
  try {
    const url = new URL(req.url)
    const requested = url.searchParams.get('showroom_id') || undefined
    ctx = await requireShowroomMember(req, requested)
  } catch (err) {
    return errorResponse(err)
  }

  const sb = supaServer()
  let q = sb
    .from('integrations')
    .select('id, showroom_id, provider, account_name, account_id, phone_number, expires_at, is_active, connected_at')
    .order('connected_at', { ascending: false })

  if (ctx.showroomId) {
    q = q.eq('showroom_id', ctx.showroomId)
  } else if (!ctx.isSuperAdmin) {
    // Defensive: shouldn't be reachable — a tenant always has a showroom.
    return NextResponse.json({ error: 'showroom_id required' }, { status: 400 })
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, integrations: data ?? [] })
}
