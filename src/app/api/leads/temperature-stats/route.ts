// ─────────────────────────────────────────────────────────────────────
// GET /api/leads/temperature-stats
// ─────────────────────────────────────────────────────────────────────
// Owner / manager only. Returns the temperature distribution for the
// caller's showroom plus the most recent recomputation timestamp.
//
// Excludes closed leads (suivi in vendu / perdu / annule) since they
// are not part of the active funnel.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomMember, errorResponse, ApiError } from '@/lib/api-auth'
import type { LeadTemperature } from '@/lib/types'

export const runtime = 'nodejs'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const CLOSED_SUIVIS = ['vendu', 'perdu', 'annule']

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }

    const admin = adminClient()
    // Closer / prospecteur only see their own assigned leads — service
    // role bypasses RLS, so we must enforce the scope explicitly here.
    const restrictToOwn = ctx.role === 'closer' || ctx.role === 'prospecteur'
    let q = admin
      .from('leads')
      .select('temperature, temperature_updated_at, suivi')
      .eq('showroom_id', ctx.showroomId)
    if (restrictToOwn) {
      q = q.eq('assigned_to', ctx.user.id)
    }
    const { data, error } = await q
    if (error) throw new ApiError(500, error.message)

    let chaud = 0, tiede = 0, froid = 0
    let lastRefreshed: string | null = null
    for (const row of (data ?? []) as Array<{
      temperature: LeadTemperature | null
      temperature_updated_at: string | null
      suivi: string | null
    }>) {
      if (row.suivi && CLOSED_SUIVIS.includes(row.suivi)) continue
      if (row.temperature === 'chaud') chaud++
      else if (row.temperature === 'tiede') tiede++
      else if (row.temperature === 'froid') froid++

      if (row.temperature_updated_at) {
        if (!lastRefreshed || row.temperature_updated_at > lastRefreshed) {
          lastRefreshed = row.temperature_updated_at
        }
      }
    }

    return NextResponse.json({
      chaud,
      tiede,
      froid,
      total: chaud + tiede + froid,
      last_refreshed: lastRefreshed,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
