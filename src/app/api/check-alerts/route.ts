import { NextResponse, type NextRequest } from 'next/server'
import { requireShowroomMember, errorResponse } from '@/lib/api-auth'
import { canSeeAllNotifications } from '@/lib/auth'
import type { AppRole } from '@/lib/types'
import type { ComputedAlert } from '@/lib/notifications'

// ─────────────────────────────────────────────────────────────
// GET /api/check-alerts
//
// READ-ONLY. Computes the 4 DERIVED alerts (lead_ignored,
// lead_stagnant, stock_rupture, vendor_inactive) from CURRENT
// state and returns them. It NO LONGER inserts notification rows.
//
// The old POST generator wrote a fresh row per lead per hour/day
// (time-bucketed dedupe_key) and nothing ever cleaned them up —
// that is what produced the "5439 unread" spam. Derived alerts are
// now ephemeral: they appear while the condition holds and vanish
// the moment the lead/stock is acted on. Only genuine EVENT
// notifications (reminder / escalation / temp_cold) stay stored.
//
// Scoping: owner/manager/super_admin → the whole showroom; everyone
// else → only leads assigned_to the caller. Showroom isolation is
// enforced by RLS on the caller's session client (ctx.authSb); the
// explicit .eq() filters mirror it for clarity + per-user scoping.
// ─────────────────────────────────────────────────────────────

export const runtime = 'nodejs'

const HOURS = 60 * 60 * 1000
const DAYS = 24 * HOURS
const SCAN_LIMIT = 50

type LeadRow = {
  id: string
  assigned_to: string | null
  full_name: string
  model_wanted: string | null
  created_at: string
  updated_at: string
}

type VehicleRow = { brand: string; model: string; status: string }

export async function GET(req: NextRequest) {
  let ctx: Awaited<ReturnType<typeof requireShowroomMember>>
  try {
    ctx = await requireShowroomMember(req)
  } catch (err) {
    return errorResponse(err)
  }

  const sb = ctx.authSb
  const userId = ctx.user.id
  const seeAll = canSeeAllNotifications(ctx.role as AppRole) || ctx.isSuperAdmin
  const nowDate = new Date()
  const now = nowDate.getTime()
  const alerts: ComputedAlert[] = []

  // ── Rule 1 — leads 'new' older than 48h ───────────────────
  {
    const cutoff = new Date(now - 48 * HOURS).toISOString()
    let q = sb
      .from('leads')
      .select('id, assigned_to, full_name, model_wanted, created_at, updated_at')
      .eq('status', 'new')
      .lt('created_at', cutoff)
    if (ctx.showroomId) q = q.eq('showroom_id', ctx.showroomId)
    if (!seeAll) q = q.eq('assigned_to', userId)
    const { data } = await q.order('created_at', { ascending: true }).limit(SCAN_LIMIT)
    for (const lead of (data ?? []) as LeadRow[]) {
      const model = lead.model_wanted ? ` — ${lead.model_wanted}` : ''
      alerts.push({
        key: `lead_ignored:${lead.id}`,
        type: 'lead_ignored',
        title: 'Lead jamais traité (+48 h)',
        message: `${lead.full_name}${model}`,
        lead_id: lead.id,
        vehicle_id: null,
        since: lead.created_at,
        href: `/dashboard/prospects?lead=${lead.id}`,
      })
    }
  }

  // ── Rule 2 — leads 'contacted' not updated for 5 days ─────
  {
    const cutoff = new Date(now - 5 * DAYS).toISOString()
    let q = sb
      .from('leads')
      .select('id, assigned_to, full_name, model_wanted, created_at, updated_at')
      .eq('status', 'contacted')
      .lt('updated_at', cutoff)
    if (ctx.showroomId) q = q.eq('showroom_id', ctx.showroomId)
    if (!seeAll) q = q.eq('assigned_to', userId)
    const { data } = await q.order('updated_at', { ascending: true }).limit(SCAN_LIMIT)
    for (const lead of (data ?? []) as LeadRow[]) {
      const model = lead.model_wanted ? ` — ${lead.model_wanted}` : ''
      alerts.push({
        key: `lead_stagnant:${lead.id}`,
        type: 'lead_stagnant',
        title: 'Lead sans évolution',
        message: `${lead.full_name}${model}`,
        lead_id: lead.id,
        vehicle_id: null,
        since: lead.updated_at,
        href: `/dashboard/prospects?lead=${lead.id}`,
      })
    }
  }

  // ── Rule 3 — the CALLER logged 0 activities today ─────────
  // Always evaluated for the caller themselves (a self-nudge), regardless
  // of seeAll — it's about the viewer's own day, not someone else's.
  {
    const dayStart = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate(),
    ).toISOString()
    const { count } = await sb
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayStart)
    if ((count ?? 0) === 0) {
      alerts.push({
        key: `vendor_inactive:${userId}`,
        type: 'vendor_inactive',
        title: "Aucune activité aujourd'hui",
        message: "Vous n'avez rien enregistré aujourd'hui — pensez à logger vos appels.",
        lead_id: null,
        vehicle_id: null,
        since: null,
        href: '/dashboard/prospects',
      })
    }
  }

  // ── Rule 4 — stock rupture with demand ────────────────────
  // Showroom-level operational alert → only for managers/owners/super_admin
  // (it isn't tied to a lead owner, so it isn't "a vendor's own lead").
  if (seeAll) {
    let vq = sb.from('vehicles').select('brand, model, status')
    if (ctx.showroomId) vq = vq.eq('showroom_id', ctx.showroomId)
    const { data: vehicles } = await vq

    const byModel = new Map<
      string,
      { available: number; total: number; brand: string; model: string }
    >()
    for (const v of (vehicles ?? []) as VehicleRow[]) {
      const k = `${v.brand.toLowerCase()}|${v.model.toLowerCase()}`
      const cur = byModel.get(k) ?? { available: 0, total: 0, brand: v.brand, model: v.model }
      cur.total += 1
      if (v.status === 'available') cur.available += 1
      byModel.set(k, cur)
    }

    for (const [, info] of byModel) {
      if (info.total > 0 && info.available === 0) {
        let dq = sb
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .ilike('model_wanted', `%${info.model}%`)
        if (ctx.showroomId) dq = dq.eq('showroom_id', ctx.showroomId)
        const { count: demand } = await dq
        if ((demand ?? 0) > 0) {
          alerts.push({
            key: `stock_rupture:${info.brand}:${info.model}`,
            type: 'stock_rupture',
            title: 'Rupture de stock',
            message: `Aucun ${info.brand} ${info.model} disponible — ${demand} lead(s) en attente`,
            lead_id: null,
            vehicle_id: null,
            since: null,
            href: '/dashboard/vehicules',
          })
        }
      }
    }
  }

  return NextResponse.json({ alerts })
}
