// ─────────────────────────────────────────────────────────────────────
// POST /api/public/rental-prospects
// ─────────────────────────────────────────────────────────────────────
// PUBLIC (no auth) — called by the catalog rental request form (chunk B).
// Inserts a rental_prospects row for the showroom resolved from `slug`.
//
// SECURITY MODEL: matches the existing public catalog write path
// (/api/catalog/[slug]/order) — a server route using the SERVICE ROLE
// client, which bypasses RLS. The table is never exposed to anon. The
// showroom is always derived from the slug; a client-supplied showroom_id
// is ignored.
//
// Anti-abuse: hidden honeypot field; in-memory IP rate limit (5 / 10 min);
// per-phone+showroom recent-row cap (3 / 10 min); length caps on text.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'
import { isRentalProspectReason } from '@/lib/rental/prospects'

export const runtime = 'nodejs'

const WINDOW_MS  = 10 * 60 * 1000   // 10 minutes
const IP_LIMIT   = 5                // max submissions per IP per window
const PHONE_LIMIT = 3               // max rows per phone+showroom per window
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/

const MAX = { full_name: 120, phone: 30, reason_other: 200, message: 1000 }

type Bucket = { count: number; resetAt: number }
const ipBuckets = new Map<string, Bucket>()

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const first = xff.split(',')[0]?.trim()
  if (first) return first
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function ipRateOk(ip: string): boolean {
  const now = Date.now()
  const cur = ipBuckets.get(ip)
  if (!cur || now > cur.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (cur.count >= IP_LIMIT) return false
  cur.count += 1
  return true
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Service role key missing.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: NextRequest) {
  try {
    // ── IP rate limit ───────────────────────────────────────────────
    const ip = getClientIp(req)
    if (!ipRateOk(ip)) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez dans quelques minutes.' }, { status: 429 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    // ── Honeypot: bots fill the hidden "company" field. Pretend success. ──
    if (body.company != null && String(body.company).trim() !== '') {
      return NextResponse.json({ ok: true })
    }

    const slug = String(body.slug ?? '').trim()
    if (!slug) return NextResponse.json({ error: 'slug requis.' }, { status: 400 })

    // ── Field extraction + length caps ──────────────────────────────
    const full_name = String(body.full_name ?? '').trim().slice(0, MAX.full_name)
    const phoneRaw  = String(body.phone ?? '').trim().slice(0, MAX.phone)
    const reason    = String(body.reason ?? '').trim()
    const reasonOther = body.reason_other ? String(body.reason_other).trim().slice(0, MAX.reason_other) : ''
    const message   = body.message ? String(body.message).trim().slice(0, MAX.message) : ''
    const startDate = body.desired_start_date ? String(body.desired_start_date).trim() : ''
    const endDate   = body.desired_end_date ? String(body.desired_end_date).trim() : ''
    const vehicleIdRaw = body.rental_vehicle_id ? String(body.rental_vehicle_id) : null

    if (!full_name) return NextResponse.json({ error: 'Nom complet requis.' }, { status: 400 })

    // Phone — Algerian normalizer (same as /api/rental/customers).
    let phone: string
    try { phone = normalizePhone(phoneRaw) }
    catch (e) {
      return NextResponse.json(
        { error: e instanceof PhoneNormalizeError ? e.message : 'Téléphone invalide.' },
        { status: 400 },
      )
    }

    // Reason.
    if (!isRentalProspectReason(reason)) {
      return NextResponse.json({ error: 'Motif invalide.' }, { status: 400 })
    }
    if (reason === 'autre' && !reasonOther) {
      return NextResponse.json({ error: 'Veuillez préciser le motif.' }, { status: 400 })
    }

    // Dates (optional). Validate format + order when present.
    if (startDate && !DATE_RX.test(startDate)) {
      return NextResponse.json({ error: 'Date de début invalide.' }, { status: 400 })
    }
    if (endDate && !DATE_RX.test(endDate)) {
      return NextResponse.json({ error: 'Date de fin invalide.' }, { status: 400 })
    }
    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json({ error: 'La date de fin doit être postérieure ou égale au début.' }, { status: 400 })
    }

    const admin = adminClient()

    // ── Resolve the showroom from slug (public, active catalog) ──────
    const { data: showroom, error: shErr } = await admin
      .from('showrooms')
      .select('id, active, catalog_enabled')
      .eq('slug', slug)
      .maybeSingle()
    if (shErr) return NextResponse.json({ error: shErr.message }, { status: 500 })
    if (!showroom || !showroom.active || !showroom.catalog_enabled) {
      return NextResponse.json({ error: 'Catalogue introuvable.' }, { status: 404 })
    }

    // ── Per phone+showroom recent cap (anti-spam) ───────────────────
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const { count: recentCount } = await admin
      .from('rental_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('showroom_id', showroom.id)
      .eq('phone', phone)
      .gte('created_at', since)
    if ((recentCount ?? 0) >= PHONE_LIMIT) {
      // Treat as success to avoid leaking state / encouraging retries.
      return NextResponse.json({ ok: true })
    }

    // ── Vehicle ownership (optional) — clear if it doesn't match ─────
    let resolvedVehicleId: string | null = null
    if (vehicleIdRaw) {
      const { data: veh } = await admin
        .from('rental_vehicles')
        .select('id, showroom_id, is_active')
        .eq('id', vehicleIdRaw)
        .maybeSingle()
      if (veh && veh.showroom_id === showroom.id && veh.is_active) {
        resolvedVehicleId = veh.id
      }
    }

    // ── Insert via service role (bypasses RLS) ──────────────────────
    const { error: insErr } = await admin
      .from('rental_prospects')
      .insert([{
        showroom_id:        showroom.id,
        rental_vehicle_id:  resolvedVehicleId,
        full_name,
        phone,
        desired_start_date: startDate || null,
        desired_end_date:   endDate || null,
        reason,
        reason_other:       reason === 'autre' ? reasonOther : null,
        message:            message || null,
        status:             'nouvelle',
        source:             'catalog_public',
      }])
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })

    // Do NOT leak internal ids to the public.
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
