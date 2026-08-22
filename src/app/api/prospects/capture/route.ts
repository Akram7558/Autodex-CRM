// ─────────────────────────────────────────────────────────────────────
// POST /api/prospects/capture
// ─────────────────────────────────────────────────────────────────────
// Public endpoint — no auth required. Captures a prospect from the
// landing page form and inserts it into super_admin_prospects, then
// notifies the AutoDex internal inbox.
//
// Uses the service-role Supabase client because the inserter has no
// session (anonymous form submission). RLS on super_admin_prospects
// would otherwise block it. Don't return the row — only `success`.
//
// Light rate-limiting: per-IP token bucket (max 3 / hour) backed by an
// in-memory Map. Survives within a single Vercel lambda invocation
// instance, so it isn't bulletproof — but cheap and effective against
// casual auto-submitters. A proper solution would be Upstash, etc.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'
import { getClientIp, checkRateLimit, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit'
import {
  SAAS_SIZE_VALUES,
  type SaasShowroomSize,
} from '@/lib/types'
import { sendEmail, internalNotifyAddress } from '@/lib/resend'

export const runtime = 'nodejs'

const IP_RULE    = { limit: 5, windowSeconds: 3600 }
const PHONE_RULE = { limit: 3, windowSeconds: 3600 }

// Map landing-page label → enum value. Tolerant: anything starting
// with "petit" / "moyen" / "grand" maps cleanly. Unknown → null.
function mapShowroomSize(raw: string | undefined): SaasShowroomSize | null {
  if (!raw) return null
  const v = String(raw).trim().toLowerCase()
  for (const opt of SAAS_SIZE_VALUES) {
    if (v.startsWith(opt)) return opt
  }
  // Direct value? (the form may already be sending the enum)
  if ((SAAS_SIZE_VALUES as readonly string[]).includes(v)) {
    return v as SaasShowroomSize
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit ─────────────────────────────────────────────────
    const ip = getClientIp(req)
    if (!(await checkRateLimit(`capture:ip:${ip}`, IP_RULE)).ok) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const full_name     = String(body.full_name     ?? '').trim()
    const phoneRaw      = String(body.phone         ?? '').trim()
    const wilaya        = String(body.wilaya        ?? '').trim()
    const showroom_name = String(body.showroom_name ?? '').trim()
    const showroom_size = mapShowroomSize(body.showroom_size)
    // Optional email — validated only when provided. Stored on the
    // super_admin_prospects.email column.
    const emailRaw      = body.email ? String(body.email).trim().toLowerCase() : ''
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return NextResponse.json({ error: 'Email invalide.' }, { status: 400 })
    }
    const email: string | null = emailRaw || null
    // The DB enum (migration_16) only allows
    // 'facebook_ads' | 'tiktok_ads' | 'landing_page' | 'manuel' | 'reference' | 'autre'
    // — so all public submissions get tagged 'landing_page' regardless
    // of which page they came from. We surface the actual originating
    // page in the internal notification text below.
    const sourceHint    = body.source ? String(body.source) : 'landing_page'
    const source        = 'landing_page' as const

    if (!full_name)     return NextResponse.json({ error: 'Nom complet requis.' },         { status: 400 })
    if (!wilaya)        return NextResponse.json({ error: 'Wilaya requise.' },             { status: 400 })
    if (!showroom_name) return NextResponse.json({ error: 'Nom du showroom requis.' },     { status: 400 })

    let phone: string
    try { phone = normalizePhone(phoneRaw) }
    catch (e) {
      const msg = e instanceof PhoneNormalizeError ? e.message : 'Téléphone invalide.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Second dimension: rotating IPs must not allow hammering one number.
    if (!(await checkRateLimit(`capture:phone:${phone}`, PHONE_RULE)).ok) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 })
    }

    // ── Service-role client (bypasses RLS) ─────────────────────────
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 })
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Duplicate check (silent — same phone is treated as success) ─
    const { data: existing, error: dupErr } = await admin
      .from('super_admin_prospects')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    if (dupErr) {
      // Not fatal — we still try to insert. But surface in logs.
      console.warn('[prospects/capture] dup check failed:', dupErr.message)
    }
    if (existing?.id) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    // ── Auto-assign via prospecteur distribution ───────────────────
    let assignedTo: string | null = null
    try {
      const { data: pickedId } = await admin.rpc('saas_pick_next_prospecteur')
      assignedTo = (pickedId as string | null) ?? null
    } catch {
      // Fall through with assignedTo=null. Internal team will assign manually.
    }

    // ── Insert ─────────────────────────────────────────────────────
    const { error: insErr } = await admin
      .from('super_admin_prospects')
      .insert([{
        full_name,
        phone,
        email,
        city:           wilaya,
        showroom_name,
        showroom_size,
        suivi:          'nouveau',
        source,
        assigned_to:    assignedTo,
        // created_by intentionally null — public submission, no user.
      }])
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 })
    }

    // ── Notify the AutoDex inbox (best-effort) ─────────────────────
    const stamp = new Date().toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' })
    const subject = `🔥 Nouveau prospect AutoDex — ${showroom_name}`
    const text =
`Nouveau prospect via ${sourceHint} :

Nom      : ${full_name}
Tél      : ${phone}
Email    : ${email ?? '—'}
Wilaya   : ${wilaya}
Showroom : ${showroom_name}
Taille   : ${showroom_size ?? '—'}
Reçu le  : ${stamp}
`
    void sendEmail({
      to:      internalNotifyAddress(),
      subject,
      text,
    }).catch(() => {})

    return NextResponse.json({ success: true, duplicate: false })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
