// ─────────────────────────────────────────────────────────────────────
// /api/rental/customers/:id/blacklist
//   POST    — flag a customer as blacklisted with a reason
//             (Owner / Manager)
//   DELETE  — clear the flag (Owner only)
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (ctx.role !== 'owner' && ctx.role !== 'manager' && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Seul un Owner ou un Manager peut blacklister un client.')
    }
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const reason = String(body.reason ?? '').trim()
    if (!reason) throw new ApiError(400, 'Raison requise.')

    const { data, error } = await ctx.authSb
      .from('rental_customers')
      .update({ blacklisted: true, blacklist_reason: reason })
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
      .select('*')
      .maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!data) throw new ApiError(404, 'Client introuvable.')
    return NextResponse.json({ customer: data })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (ctx.role !== 'owner' && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Seul un Owner peut lever un blacklist.')
    }
    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const { data, error } = await ctx.authSb
      .from('rental_customers')
      .update({ blacklisted: false, blacklist_reason: null })
      .eq('id', id)
      .eq('showroom_id', ctx.showroomId)
      .select('*')
      .maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!data) throw new ApiError(404, 'Client introuvable.')
    return NextResponse.json({ customer: data })
  } catch (err) {
    return errorResponse(err)
  }
}
