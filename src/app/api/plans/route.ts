// ─────────────────────────────────────────────────────────────────────
// GET /api/plans?type=classique|totale
// ─────────────────────────────────────────────────────────────────────
// Public endpoint used by the landing page to populate the Pricing
// section. Filters `saas_plans` by `plan_type` (migration 36) and
// returns active rows ordered by duration_months ASC.
//
// Caching: `Cache-Control: public, max-age=300, s-maxage=300` (5min).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const VALID_TYPES = new Set(['classique', 'totale'])

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: 'Query param `type` must be `classique` or `totale`.' },
      { status: 400 },
    )
  }

  const admin = adminClient()
  if (!admin) {
    return NextResponse.json(
      { error: 'Supabase service role key not configured.' },
      { status: 500 },
    )
  }

  const { data, error } = await admin
    .from('saas_plans')
    .select('id, name, duration_months, price, plan_type')
    .eq('plan_type', type)
    .eq('active', true)
    .order('duration_months', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { plans: data ?? [] },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    },
  )
}
