// ─────────────────────────────────────────────────────────────────────
// /api/saas-prospects/[id]
//   PATCH  — update editable fields (RLS gates the row)
//   DELETE — super_admin only
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireInternalUser, requireSuperAdmin, errorResponse } from '@/lib/api-auth'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'
import {
  SAAS_SUIVI_VALUES, SAAS_SOURCE_VALUES, SAAS_SIZE_VALUES,
  type SaasSuivi, type SaasSource, type SaasShowroomSize,
} from '@/lib/types'

export const runtime = 'nodejs'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireInternalUser(req)
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}

    if (body.full_name     !== undefined) updates.full_name     = String(body.full_name).trim()
    if (body.showroom_name !== undefined) updates.showroom_name = String(body.showroom_name).trim()
    if (body.city          !== undefined) updates.city          = body.city  ? String(body.city).trim()  : null
    if (body.notes         !== undefined) updates.notes         = body.notes ? String(body.notes)         : null

    if (body.email !== undefined) {
      const e = body.email ? String(body.email).trim().toLowerCase() : null
      if (e && !EMAIL_RX.test(e)) {
        return NextResponse.json({ error: 'Email invalide.' }, { status: 400 })
      }
      updates.email = e
    }

    if (body.phone !== undefined) {
      try { updates.phone = normalizePhone(String(body.phone)) }
      catch (e) {
        const msg = e instanceof PhoneNormalizeError ? e.message : 'Téléphone invalide.'
        return NextResponse.json({ error: msg }, { status: 400 })
      }
    }

    if (body.showroom_size !== undefined) {
      const s = body.showroom_size ? String(body.showroom_size) as SaasShowroomSize : null
      if (s && !SAAS_SIZE_VALUES.includes(s)) {
        return NextResponse.json({ error: 'Taille invalide.' }, { status: 400 })
      }
      updates.showroom_size = s
    }
    if (body.source !== undefined) {
      const v = String(body.source) as SaasSource
      if (!SAAS_SOURCE_VALUES.includes(v)) {
        return NextResponse.json({ error: 'Source invalide.' }, { status: 400 })
      }
      updates.source = v
    }
    if (body.suivi !== undefined) {
      const v = String(body.suivi) as SaasSuivi
      if (!SAAS_SUIVI_VALUES.includes(v)) {
        return NextResponse.json({ error: 'Suivi invalide.' }, { status: 400 })
      }
      updates.suivi = v
    }

    if (body.assigned_to !== undefined) {
      const target = body.assigned_to ? String(body.assigned_to) : null
      // prospecteur_saas may only (re)assign to themselves.
      if (ctx.role === 'prospecteur_saas' && target && target !== ctx.user.id) {
        return NextResponse.json({ error: 'Vous ne pouvez assigner qu\'à vous-même.' }, { status: 403 })
      }
      updates.assigned_to = target
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 })
    }

    const { data, error } = await ctx.authSb
      .from('super_admin_prospects')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!data)  return NextResponse.json({ error: 'Prospect introuvable ou accès refusé.' }, { status: 404 })

    return NextResponse.json({ prospect: data })
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
      .from('super_admin_prospects')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
