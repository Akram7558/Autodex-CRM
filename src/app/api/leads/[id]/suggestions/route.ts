// ─────────────────────────────────────────────────────────────────────
// GET /api/leads/:id/suggestions
// ─────────────────────────────────────────────────────────────────────
// Owner / manager only. Lazy-fetched from the lead detail modal. Calls
// suggest_vehicles_for_lead(uuid) and suggest_preorders_for_lead(uuid)
// RPCs (added in migration 29) and hydrates the returned ids back to
// full Vehicle / PreorderVehicle rows so the UI can render cards
// without a second round trip.
//
// Tenant isolation: verifies the lead belongs to the caller's
// showroom, and the RPC itself only returns same-showroom rows.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import type { Vehicle, PreorderVehicle } from '@/lib/types'

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

    // Tenant isolation.
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .select('id, showroom_id')
      .eq('id', id)
      .maybeSingle()
    if (leadErr) throw new ApiError(500, leadErr.message)
    if (!lead) throw new ApiError(404, 'Lead introuvable.')
    if (!ctx.isSuperAdmin && lead.showroom_id !== ctx.showroomId) {
      throw new ApiError(404, 'Lead introuvable.')
    }

    const [vRes, pRes] = await Promise.all([
      admin.rpc('suggest_vehicles_for_lead',  { p_lead_id: id, p_limit: 3 }),
      admin.rpc('suggest_preorders_for_lead', { p_lead_id: id, p_limit: 2 }),
    ])
    if (vRes.error) throw new ApiError(500, vRes.error.message)
    if (pRes.error) throw new ApiError(500, pRes.error.message)

    type VRow = { vehicle_id: string;  match_score: number; match_reasons: string[] | null }
    type PRow = { preorder_id: string; match_score: number; match_reasons: string[] | null }

    const vRows = (vRes.data ?? []) as VRow[]
    const pRows = (pRes.data ?? []) as PRow[]

    const vehicleIds  = vRows.map(r => r.vehicle_id).filter(Boolean)
    const preorderIds = pRows.map(r => r.preorder_id).filter(Boolean)

    const [vehicleHydration, preorderHydration] = await Promise.all([
      vehicleIds.length === 0
        ? Promise.resolve({ data: [] as Vehicle[], error: null })
        : admin.from('vehicles').select('*').in('id', vehicleIds),
      preorderIds.length === 0
        ? Promise.resolve({ data: [] as PreorderVehicle[], error: null })
        : admin.from('preorder_vehicles').select('*').in('id', preorderIds),
    ])
    if (vehicleHydration.error)  throw new ApiError(500, vehicleHydration.error.message)
    if (preorderHydration.error) throw new ApiError(500, preorderHydration.error.message)

    const vehiclesById  = new Map((vehicleHydration.data  ?? []).map((v) => [(v as Vehicle).id, v as Vehicle]))
    const preordersById = new Map((preorderHydration.data ?? []).map((p) => [(p as PreorderVehicle).id, p as PreorderVehicle]))

    const vehicles = vRows
      .map(r => {
        const v = vehiclesById.get(r.vehicle_id)
        if (!v) return null
        return { vehicle: v, match_score: r.match_score, match_reasons: r.match_reasons ?? [] }
      })
      .filter((x): x is { vehicle: Vehicle; match_score: number; match_reasons: string[] } => !!x)

    const preorders = pRows
      .map(r => {
        const p = preordersById.get(r.preorder_id)
        if (!p) return null
        return { preorder: p, match_score: r.match_score, match_reasons: r.match_reasons ?? [] }
      })
      .filter((x): x is { preorder: PreorderVehicle; match_score: number; match_reasons: string[] } => !!x)

    return NextResponse.json({ vehicles, preorders })
  } catch (err) {
    return errorResponse(err)
  }
}
