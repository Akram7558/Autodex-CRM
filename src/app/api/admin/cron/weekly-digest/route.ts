// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/cron/weekly-digest
// ─────────────────────────────────────────────────────────────────────
// Weekly owner digest. For every ACTIVE showroom, computes the last-7-days
// metrics (module-aware) and emails the showroom's owner(s) a recap. Empty
// showrooms (no activity in the window) are skipped — no empty digests.
//
// Scheduled by vercel.json crons (Monday 05:00 UTC = 06:00 Algiers).
//
// ── Auth ──
// Same as trial-check: Authorization: Bearer <CRON_SECRET>, constant-time
// compared. 401 on mismatch, 500 if CRON_SECRET is unset. Uses the
// SERVICE-ROLE supabase client (bypasses RLS — we iterate all showrooms
// server-side and scope every query by showroom_id ourselves).
//
// REQUIRED ENV VARS:
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, weeklyDigestEmail } from '@/lib/resend'

export const runtime = 'nodejs'

// Same threshold as the check-alerts gros_paiement owner rule.
const SEUIL_GROS_PAIEMENT = 50_000
const DASHBOARD_URL = 'https://www.autodex.store/dashboard'
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 'YYYY-MM-DD' in UTC (for end_date::date comparisons). */
function dayKeyUtc(d: Date): string {
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
function dayFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Algiers' })
    .format(new Date(iso))
}

type ShowroomRow = { id: string; name: string; module_vente: boolean | null; module_location: boolean | null }

type DigestMetrics = {
  newLeads:  number
  vente:     { count: number; ca: number } | null
  location:  { newRentals: number; collected: number } | null
  alerts:    { overdue: number; bigPayments: number; silent: number } | null
}

async function computeMetrics(
  admin: SupabaseClient, s: ShowroomRow, windowStart: string, today: string,
): Promise<DigestMetrics> {
  const X = s.id

  // Always: new leads in the window.
  const newLeadsP = admin.from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('showroom_id', X).gte('created_at', windowStart)

  // module_vente: ventes + CA, and silent sales leads (tentative_3).
  const venteP = s.module_vente
    ? admin.from('ventes').select('prix_vente').eq('showroom_id', X).gte('date_vente', windowStart)
    : null
  const silentLeadsP = s.module_vente
    ? admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('showroom_id', X).eq('suivi', 'tentative_3').neq('status', 'won').neq('status', 'lost')
    : null

  // module_location: new rentals, payments (collected + big), overdue, silent prospects.
  const newRentalsP = s.module_location
    ? admin.from('rentals').select('id', { count: 'exact', head: true })
        .eq('showroom_id', X).gte('created_at', windowStart).is('deleted_at', null)
    : null
  const paymentsP = s.module_location
    ? admin.from('rental_payments').select('amount, type, rentals!inner(showroom_id)')
        .eq('rentals.showroom_id', X).gte('created_at', windowStart)
    : null
  const overdueP = s.module_location
    ? admin.from('rentals').select('id', { count: 'exact', head: true })
        .eq('showroom_id', X).in('status', ['active', 'overdue']).lt('end_date', today).is('deleted_at', null)
    : null
  const silentProspectsP = s.module_location
    ? admin.from('rental_prospects').select('id', { count: 'exact', head: true })
        .eq('showroom_id', X).eq('status', 'tentative_3').is('deleted_at', null)
    : null

  const [newLeads, vente, silentLeads, newRentals, payments, overdue, silentProspects] = await Promise.all([
    newLeadsP, venteP, silentLeadsP, newRentalsP, paymentsP, overdueP, silentProspectsP,
  ])

  const venteRows   = (vente?.data ?? []) as Array<{ prix_vente: number | null }>
  const paymentRows = (payments?.data ?? []) as Array<{ amount: number | string | null; type: string }>
  const credited    = paymentRows.filter((p) => p.type !== 'refund')
  const collected   = credited.reduce((acc, p) => acc + Number(p.amount ?? 0), 0)
  const bigPayments = credited.filter((p) => Number(p.amount ?? 0) >= SEUIL_GROS_PAIEMENT).length
  const silent      = (silentLeads?.count ?? 0) + (silentProspects?.count ?? 0)

  return {
    newLeads: newLeads.count ?? 0,
    vente: s.module_vente
      ? { count: venteRows.length, ca: venteRows.reduce((acc, v) => acc + (v.prix_vente ?? 0), 0) }
      : null,
    location: s.module_location
      ? { newRentals: newRentals?.count ?? 0, collected }
      : null,
    alerts: (s.module_vente || s.module_location)
      ? { overdue: overdue?.count ?? 0, bigPayments, silent }
      : null,
  }
}

function hasActivity(m: DigestMetrics): boolean {
  return m.newLeads > 0
    || !!(m.vente && (m.vente.count > 0 || m.vente.ca > 0))
    || !!(m.location && (m.location.newRentals > 0 || m.location.collected > 0))
    || !!(m.alerts && (m.alerts.overdue + m.alerts.bigPayments + m.alerts.silent) > 0)
}

export async function GET(req: NextRequest) {
  // ── Auth (identical to trial-check) ─────────────────────────────────
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré.' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  const presented = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
  if (!presented || !constantTimeEqual(presented, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant.' }, { status: 500 })
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date()
  const windowStart = new Date(now.getTime() - WINDOW_MS).toISOString()
  const today = dayKeyUtc(now)
  const periodLabel = `Semaine du ${dayFr(windowStart)} au ${dayFr(now.toISOString())}`

  // ── Active showrooms ────────────────────────────────────────────────
  const { data: showroomRows, error: sErr } = await admin
    .from('showrooms')
    .select('id, name, module_vente, module_location')
    .eq('active', true)
  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 })
  }
  const showrooms = (showroomRows ?? []) as ShowroomRow[]
  if (showrooms.length === 0) {
    return NextResponse.json({ ok: true, showrooms: 0, emailsSent: 0, skipped: 0 })
  }

  // ── Owner emails for every showroom (one listUsers pass) ────────────
  const ids = showrooms.map((s) => s.id)
  const { data: owners } = await admin
    .from('user_roles')
    .select('user_id, showroom_id')
    .in('showroom_id', ids)
    .eq('role', 'owner')

  const wantedUserIds = new Set((owners ?? []).map((o) => o.user_id as string))
  const emailByUser = new Map<string, string | null>()
  for (let page = 1; page <= 10 && emailByUser.size < wantedUserIds.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) { console.warn('[cron] listUsers failed:', error.message); break }
    for (const u of data.users) if (wantedUserIds.has(u.id)) emailByUser.set(u.id, u.email ?? null)
    if (data.users.length < 200) break
  }
  const emailsByShowroom = new Map<string, string[]>()
  for (const o of owners ?? []) {
    const email = emailByUser.get(o.user_id as string) ?? null
    if (!email) continue
    const arr = emailsByShowroom.get(o.showroom_id as string) ?? []
    if (!arr.includes(email)) arr.push(email)
    emailsByShowroom.set(o.showroom_id as string, arr)
  }

  // ── Per-showroom digest ─────────────────────────────────────────────
  let emailsSent = 0
  let skipped = 0
  for (const s of showrooms) {
    const metrics = await computeMetrics(admin, s, windowStart, today)
    const recipients = emailsByShowroom.get(s.id) ?? []
    if (!hasActivity(metrics) || recipients.length === 0) { skipped++; continue }

    const tpl = weeklyDigestEmail({ showroomName: s.name, periodLabel, dashboardUrl: DASHBOARD_URL, metrics })
    for (const to of recipients) {
      const r = await sendEmail({ to, subject: tpl.subject, text: tpl.text, html: tpl.html })
      if (r.ok) emailsSent++
      else console.warn(`[cron] weekly-digest send failed for ${s.id}:`, r.error)
    }
  }

  return NextResponse.json({ ok: true, showrooms: showrooms.length, emailsSent, skipped })
}
