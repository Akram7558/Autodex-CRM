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

// Owner-rule embeds (Supabase nested selects arrive as object OR 1-el array).
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}
const fmtDzd = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)

type CustomerEmbed = { full_name: string | null }
type RentalEmbed = { id: string; contract_number: string | null; customer: CustomerEmbed | CustomerEmbed[] | null }
type PaymentRow = { id: string; amount: number | string; created_at: string; rental: RentalEmbed | RentalEmbed[] | null }
type SilenceRow = { id: string; full_name: string; updated_at: string | null; created_at: string }
type CancelRow = { id: string; contract_number: string | null; updated_at: string; customer: CustomerEmbed | CustomerEmbed[] | null }

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
  // Server-local midnight "today" — shared by vendor_inactive + gros_paiement.
  const dayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).toISOString()
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

  // ── Rule 5 — large payments today (owner-level) ───────────
  // Notable cash-in events. SEUIL ajustable / future config showroom.
  // rental_payments has no showroom_id — RLS scopes it via its rental.
  if (seeAll) {
    const SEUIL_GROS_PAIEMENT = 50_000 // DZD
    const { data } = await sb
      .from('rental_payments')
      .select('id, amount, created_at, rental:rentals(id, contract_number, customer:rental_customers(full_name))')
      .gte('amount', SEUIL_GROS_PAIEMENT)
      .gte('created_at', dayStart)
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT)
    for (const p of (data ?? []) as PaymentRow[]) {
      const rental = firstOf(p.rental)
      const customer = firstOf(rental?.customer)
      alerts.push({
        key: `gros_paiement:${p.id}`,
        type: 'gros_paiement',
        title: 'Gros paiement',
        message: `${fmtDzd(Number(p.amount))} DZD — ${customer?.full_name ?? 'Client'} (${rental?.contract_number ?? 'sans n°'})`,
        lead_id: null,
        vehicle_id: null,
        since: p.created_at,
        href: rental?.id ? `/dashboard/location/contrats/${rental.id}` : '/dashboard/location/contrats',
      })
    }
  }

  // ── Rule 6 — clients at 3 unanswered attempts (owner-level) ─
  if (seeAll) {
    // Sales leads: `suivi` is the relance tracker (tentative_3 = 3 attempts),
    // still in the pipeline (not won/lost).
    let lq = sb
      .from('leads')
      .select('id, full_name, updated_at, created_at')
      .eq('suivi', 'tentative_3')
      .neq('status', 'won')
      .neq('status', 'lost')
    if (ctx.showroomId) lq = lq.eq('showroom_id', ctx.showroomId)
    const { data: lr } = await lq.order('updated_at', { ascending: true }).limit(SCAN_LIMIT)
    for (const l of (lr ?? []) as SilenceRow[]) {
      alerts.push({
        key: `client_silence_3:${l.id}`,
        type: 'client_silence_3',
        title: 'Client ne répond plus',
        message: `${l.full_name} — 3 tentatives sans réponse`,
        lead_id: l.id,
        vehicle_id: null,
        since: l.updated_at ?? l.created_at,
        href: `/dashboard/prospects?lead=${l.id}`,
      })
    }
    // Rental prospects: migration 45 made `status` the suivi field, so
    // status='tentative_3' = 3 attempts (already non-converti / non-perdu).
    let pq = sb
      .from('rental_prospects')
      .select('id, full_name, updated_at, created_at')
      .eq('status', 'tentative_3')
      .is('deleted_at', null)
    if (ctx.showroomId) pq = pq.eq('showroom_id', ctx.showroomId)
    const { data: pr } = await pq.order('updated_at', { ascending: true }).limit(SCAN_LIMIT)
    for (const p of (pr ?? []) as SilenceRow[]) {
      alerts.push({
        key: `client_silence_3:rp:${p.id}`,
        type: 'client_silence_3',
        title: 'Client ne répond plus',
        message: `${p.full_name} — 3 tentatives sans réponse`,
        lead_id: null,
        vehicle_id: null,
        since: p.updated_at ?? p.created_at,
        href: '/dashboard/location/prospects',
      })
    }
  }

  // ── Rule 7 — rentals cancelled in the last 24h (owner-level) ─
  // No cancelled_at column in DB → recency inferred from updated_at.
  if (seeAll) {
    const cutoff = new Date(now - 24 * HOURS).toISOString()
    let q = sb
      .from('rentals')
      .select('id, contract_number, updated_at, customer:rental_customers(full_name)')
      .eq('status', 'cancelled')
      .gte('updated_at', cutoff)
      .is('deleted_at', null)
    if (ctx.showroomId) q = q.eq('showroom_id', ctx.showroomId)
    const { data } = await q.order('updated_at', { ascending: false }).limit(SCAN_LIMIT)
    for (const r of (data ?? []) as CancelRow[]) {
      const customer = firstOf(r.customer)
      alerts.push({
        key: `annulation:${r.id}`,
        type: 'annulation',
        title: 'Location annulée',
        message: `${customer?.full_name ?? 'Client'} — ${r.contract_number ?? 'sans n°'}`,
        lead_id: null,
        vehicle_id: null,
        since: r.updated_at,
        href: `/dashboard/location/contrats/${r.id}`,
      })
    }
  }

  return NextResponse.json({ alerts })
}
