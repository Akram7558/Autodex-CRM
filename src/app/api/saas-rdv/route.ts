// ─────────────────────────────────────────────────────────────────────
// /api/saas-rdv
//   GET   — paginated list with prospect joined (super_admin / commercial)
//   POST  — create RDV (super_admin / commercial)
// prospecteur_saas is denied 403 on both.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireInternalUser, ApiError, errorResponse } from '@/lib/api-auth'
import {
  SAAS_RDV_STATUS_VALUES, type SaasRdvStatus,
} from '@/lib/types'

export const runtime = 'nodejs'

function ensureSuperOrCommercial(role: string) {
  if (role !== 'super_admin' && role !== 'commercial') {
    throw new ApiError(403, 'Accès refusé.')
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireInternalUser(req)
    ensureSuperOrCommercial(ctx.role)

    const url        = new URL(req.url)
    const status     = url.searchParams.get('status')
    const prospectId = url.searchParams.get('prospect_id')
    const dateFrom   = url.searchParams.get('date_from')
    const dateTo     = url.searchParams.get('date_to')
    const search     = url.searchParams.get('search')?.trim() ?? ''
    const page       = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1)
    const limit      = Math.min(150, Math.max(1, parseInt(url.searchParams.get('limit') ?? '15', 10) || 15))
    const from       = (page - 1) * limit
    const to         = from + limit - 1

    let q = ctx.authSb
      .from('super_admin_rdv')
      .select(`
        *,
        prospect:super_admin_prospects ( id, full_name, phone, showroom_name, suivi )
      `, { count: 'exact' })
      .order('scheduled_at', { ascending: true })
      .range(from, to)

    if (status && SAAS_RDV_STATUS_VALUES.includes(status as SaasRdvStatus)) q = q.eq('status', status)
    if (prospectId) q = q.eq('prospect_id', prospectId)
    if (dateFrom)   q = q.gte('scheduled_at', dateFrom)
    if (dateTo)     q = q.lte('scheduled_at', dateTo)

    const { data, error, count } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Filter by prospect name client-side after the join (PostgREST
    // doesn't easily support OR-across-foreign-table searches).
    let rows = data ?? []
    if (search) {
      const term = search.toLowerCase()
      rows = rows.filter((r: { prospect?: { full_name?: string | null; showroom_name?: string | null } }) => {
        const p = r.prospect
        return (
          (p?.full_name     ?? '').toLowerCase().includes(term)
          || (p?.showroom_name ?? '').toLowerCase().includes(term)
        )
      })
    }

    return NextResponse.json({
      rdv:   rows,
      total: count ?? 0,
      page,
      limit,
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireInternalUser(req)
    ensureSuperOrCommercial(ctx.role)

    const body = await req.json().catch(() => ({}))
    const prospect_id  = String(body.prospect_id  ?? '').trim()
    const scheduledRaw = String(body.scheduled_at ?? '').trim()
    const status       = body.status      ? String(body.status) as SaasRdvStatus : 'planifie'
    const notes        = body.notes       ? String(body.notes)  : null
    const assigned_to  = body.assigned_to ? String(body.assigned_to) : null

    if (!prospect_id)  return NextResponse.json({ error: 'prospect_id requis.' }, { status: 400 })
    if (!scheduledRaw) return NextResponse.json({ error: 'Date du RDV requise.' }, { status: 400 })

    const scheduled_at = new Date(scheduledRaw)
    if (Number.isNaN(scheduled_at.getTime())) {
      return NextResponse.json({ error: 'Date du RDV invalide.' }, { status: 400 })
    }
    if (!SAAS_RDV_STATUS_VALUES.includes(status)) {
      return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 })
    }

    // Confirm the prospect exists & is visible to the caller (RLS).
    const { data: prospect, error: pErr } = await ctx.authSb
      .from('super_admin_prospects')
      .select('id')
      .eq('id', prospect_id)
      .maybeSingle()
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!prospect) return NextResponse.json({ error: 'Prospect introuvable.' }, { status: 404 })

    const { data, error } = await ctx.authSb
      .from('super_admin_rdv')
      .insert([{
        prospect_id,
        scheduled_at: scheduled_at.toISOString(),
        status,
        notes,
        assigned_to,
        // created_by stamped by the BEFORE INSERT trigger.
      }])
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ rdv: data })
  } catch (err) {
    return errorResponse(err)
  }
}
