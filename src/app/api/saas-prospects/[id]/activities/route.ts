// ─────────────────────────────────────────────────────────────────────
// GET /api/saas-prospects/[id]/activities
// ─────────────────────────────────────────────────────────────────────
// Returns the activity log for a prospect, newest first. RLS filters
// per role — prospecteur_saas only sees activities on their own
// prospects.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireInternalUser, errorResponse } from '@/lib/api-auth'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireInternalUser(req)
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const { data, error } = await ctx.authSb
      .from('super_admin_activities')
      .select('*')
      .eq('prospect_id', id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ activities: data ?? [] })
  } catch (err) {
    return errorResponse(err)
  }
}
