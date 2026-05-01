import { NextResponse, type NextRequest } from 'next/server'
import { supaServer, isAllowedProvider } from '@/lib/integrations-utils'
import { requireShowroomMember, errorResponse } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST body (one of):
//   { id: string }
//   { showroom_id: string, provider: 'whatsapp' | 'messenger' | 'instagram' }
//
// In both modes the caller must be authenticated and either be a
// super_admin or belong to the showroom the integration belongs to.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* ignore */ }

  const id        = typeof body.id === 'string' ? body.id : null
  const provider  = typeof body.provider === 'string' ? body.provider : null
  const requested = typeof body.showroom_id === 'string' ? body.showroom_id : null

  // Resolve the showroom we'll authorise against. For "by id" we look the
  // row up first (with the service role) so we know which showroom owns
  // it, then verify the caller belongs to that showroom.
  let targetShowroomId: string | null = null
  if (id) {
    const probe = supaServer()
    const { data: row, error } = await probe
      .from('integrations')
      .select('showroom_id')
      .eq('id', id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!row)  return NextResponse.json({ error: 'integration not found' }, { status: 404 })
    targetShowroomId = (row.showroom_id as string | null) ?? null
  } else if (requested && provider && isAllowedProvider(provider)) {
    targetShowroomId = requested
  } else {
    return NextResponse.json({ error: 'id or (showroom_id + provider) required' }, { status: 400 })
  }

  let ctx
  try {
    ctx = await requireShowroomMember(req, targetShowroomId)
  } catch (err) {
    return errorResponse(err)
  }

  // For tenant users `ctx.showroomId` is forced to their own showroom; for
  // super_admin it equals the requested target above. Either way, scope
  // the delete to the validated showroom rather than the raw request.
  const effectiveShowroomId = ctx.showroomId ?? targetShowroomId
  if (!effectiveShowroomId) {
    return NextResponse.json({ error: 'showroom resolution failed' }, { status: 500 })
  }

  const sb = supaServer()
  let query = sb.from('integrations').delete().eq('showroom_id', effectiveShowroomId)
  if (id) {
    query = query.eq('id', id)
  } else if (provider) {
    query = query.eq('provider', provider)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
