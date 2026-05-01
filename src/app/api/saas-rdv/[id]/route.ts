// ─────────────────────────────────────────────────────────────────────
// /api/saas-rdv/[id]
//   PATCH  — super_admin / commercial
//   DELETE — super_admin only
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireInternalUser, requireSuperAdmin, ApiError, errorResponse } from '@/lib/api-auth'
import { SAAS_RDV_STATUS_VALUES, type SaasRdvStatus } from '@/lib/types'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

function ensureSuperOrCommercial(role: string) {
  if (role !== 'super_admin' && role !== 'commercial') {
    throw new ApiError(403, 'Accès refusé.')
  }
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireInternalUser(req)
    ensureSuperOrCommercial(ctx.role)
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}

    if (body.scheduled_at !== undefined) {
      const d = new Date(String(body.scheduled_at))
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Date du RDV invalide.' }, { status: 400 })
      }
      updates.scheduled_at = d.toISOString()
    }
    if (body.status !== undefined) {
      const s = String(body.status) as SaasRdvStatus
      if (!SAAS_RDV_STATUS_VALUES.includes(s)) {
        return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 })
      }
      updates.status = s
    }
    if (body.notes       !== undefined) updates.notes       = body.notes ? String(body.notes) : null
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to ? String(body.assigned_to) : null
    if (body.prospect_id !== undefined) updates.prospect_id = String(body.prospect_id)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 })
    }

    const { data, error } = await ctx.authSb
      .from('super_admin_rdv')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!data)  return NextResponse.json({ error: 'RDV introuvable.' }, { status: 404 })

    return NextResponse.json({ rdv: data })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireSuperAdmin(req)
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const { error } = await ctx.authSb
      .from('super_admin_rdv')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
