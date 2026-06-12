// ─────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────
// Public self-registration endpoint. Provisions a 20-day-trial showroom
// + owner account in one atomic flow. The client follows up with a
// `signInWithPassword` call (option (a)) using the credentials it
// already has on hand, so the user lands on /dashboard logged in.
//
// Sequence (manual rollback on every step except 5–6, which are
// best-effort):
//
//   1. Validate body + check email-exists / showroom-name conflicts
//   2. Create the auth user (`auth.admin.createUser`)
//   3. Insert showroom (is_trial=true, trial_ends_at=now+20d)
//   4. Insert user_roles (role='owner')
//   5. Insert super_admin_prospects row (best-effort — non-fatal)
//   6. Send welcome email to owner + internal notification (best-effort)
//
// Rate limit: 3 submissions per IP per hour (in-memory, per lambda).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'
import {
  SAAS_SIZE_VALUES, type SaasShowroomSize,
} from '@/lib/types'
import {
  sendEmail, internalNotifyAddress,
  welcomeTrialEmail, internalTrialStartedEmail,
  formatDateFr,
} from '@/lib/resend'

export const runtime = 'nodejs'

const HOUR_MS    = 60 * 60 * 1000
const RATE_LIMIT = 3
const TRIAL_DAYS = 20
const EMAIL_RX   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── In-memory IP rate limit (per lambda instance) ────────────────────
type Bucket = { count: number; resetAt: number }
const ipBuckets = new Map<string, Bucket>()

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const first = xff.split(',')[0]?.trim()
  if (first) return first
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function rateLimitOk(ip: string): boolean {
  const now = Date.now()
  const cur = ipBuckets.get(ip)
  if (!cur || now > cur.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + HOUR_MS })
    return true
  }
  if (cur.count >= RATE_LIMIT) return false
  cur.count += 1
  return true
}

function mapShowroomSize(raw: string | undefined): SaasShowroomSize | null {
  if (!raw) return null
  const v = String(raw).trim().toLowerCase()
  for (const opt of SAAS_SIZE_VALUES) {
    if (v.startsWith(opt)) return opt
  }
  if ((SAAS_SIZE_VALUES as readonly string[]).includes(v)) {
    return v as SaasShowroomSize
  }
  return null
}

// (email-existence walk lives inline in the handler below — typing the
// supabase admin client through a helper parameter is awkward across
// supabase-js generic boundaries, so we just iterate locally.)

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    if (!rateLimitOk(ip)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans une heure.' },
        { status: 429 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const showroom_name = String(body.showroom_name ?? '').trim()
    const full_name     = String(body.full_name     ?? '').trim()
    const emailRaw      = String(body.email         ?? '').trim().toLowerCase()
    const password      = String(body.password      ?? '')
    const phoneRaw      = String(body.phone         ?? '').trim()
    const wilaya        = String(body.wilaya        ?? '').trim()
    const showroom_size = mapShowroomSize(body.showroom_size)
    // Optional plan choice carried over from the landing Pricing CTA
    // (/register?plan=<id>). Validated below against ACTIVE saas_plans;
    // invalid/missing falls back to the default vente-only trial.
    const planIdRaw     = body.plan_id ? String(body.plan_id).trim() : ''

    if (!showroom_name) return NextResponse.json({ error: 'Nom du showroom requis.' }, { status: 400 })
    if (!full_name)     return NextResponse.json({ error: 'Nom complet requis.' },     { status: 400 })
    if (!emailRaw || !EMAIL_RX.test(emailRaw)) {
      return NextResponse.json({ error: 'Email invalide.' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe (≥ 8 caractères) requis.' }, { status: 400 })
    }
    if (!wilaya) return NextResponse.json({ error: 'Wilaya requise.' }, { status: 400 })

    let phone: string
    try { phone = normalizePhone(phoneRaw) }
    catch (e) {
      const msg = e instanceof PhoneNormalizeError ? e.message : 'Téléphone invalide.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // ── Service-role admin client ──────────────────────────────────
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 })
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 0. Resolve the chosen plan's modules (best-effort) ─────────
    // The trial stays a trial: is_trial=true and plan_id is NOT stamped
    // on the showroom (plan_id marks PAYING customers — see direct-
    // convert). The chosen plan only shapes module_vente/module_location
    // and is recorded on the SaaS prospect row (notes) for the sales
    // team. Any lookup failure → historical default (vente-only).
    let moduleVente = true
    let moduleLocation = false
    let chosenPlanName: string | null = null
    if (planIdRaw) {
      const { data: plan } = await admin
        .from('saas_plans')
        .select('id, name, module_vente, module_location')
        .eq('id', planIdRaw)
        .eq('active', true)
        .maybeSingle()
      if (plan) {
        const pm = plan as { module_vente?: boolean | null; module_location?: boolean | null }
        moduleVente    = pm.module_vente !== false
        moduleLocation = pm.module_location === true
        chosenPlanName = String(plan.name)
      }
    }

    // ── 1a. Email-already-used check ───────────────────────────────
    // Walk admin.auth.admin.listUsers up to 5 pages of 200 (1 000 users).
    // Bails early if the page returned isn't full (= last page).
    let emailTaken = false
    try {
      for (let page = 1; page <= 5; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
        if (error) throw new Error(error.message)
        if (data.users.some(u => (u.email ?? '').toLowerCase() === emailRaw)) {
          emailTaken = true
          break
        }
        if (data.users.length < 200) break
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Vérification email impossible.'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    if (emailTaken) {
      return NextResponse.json(
        { error: 'Un compte existe déjà avec cet email.' },
        { status: 409 },
      )
    }

    // ── 1b. Showroom-name uniqueness ───────────────────────────────
    // Hard 409 even when the conflicting showroom is inactive — per
    // spec, operations team handles reactivation manually.
    const { data: nameClash, error: nameErr } = await admin
      .from('showrooms')
      .select('id')
      .ilike('name', showroom_name)
      .limit(1)
      .maybeSingle()
    if (nameErr) {
      return NextResponse.json({ error: nameErr.message }, { status: 500 })
    }
    if (nameClash) {
      return NextResponse.json(
        { error: 'Un showroom avec ce nom existe déjà.' },
        { status: 409 },
      )
    }

    // ── 2. Create auth user ────────────────────────────────────────
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         emailRaw,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    })
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? 'Erreur lors de la création du compte.' },
        { status: 500 },
      )
    }
    const newUserId = created.user.id

    // ── 3. Showroom (trial, 20 days) ───────────────────────────────
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * HOUR_MS)
    const showroomInsert: Record<string, unknown> = {
      name:          showroom_name,
      city:          wilaya,
      owner_email:   emailRaw,
      module_vente:  moduleVente,
      module_location: moduleLocation,
      active:        true,
      is_trial:      true,
      trial_ends_at: trialEndsAt.toISOString(),
    }
    const { data: shroom, error: shErr } = await admin
      .from('showrooms')
      .insert([showroomInsert])
      .select('id')
      .single()
    if (shErr || !shroom) {
      // Rollback the auth user.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return NextResponse.json(
        { error: shErr?.message ?? 'Erreur lors de la création du showroom.' },
        { status: 500 },
      )
    }

    // ── 4. user_roles binding ──────────────────────────────────────
    const { error: urErr } = await admin
      .from('user_roles')
      .insert([{
        user_id:     newUserId,
        showroom_id: shroom.id,
        role:        'owner',
      }])
    if (urErr) {
      // Rollback the showroom + the auth user.
      await admin.from('showrooms').delete().eq('id', shroom.id).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return NextResponse.json(
        { error: urErr.message ?? 'Erreur lors de l\'attribution du rôle.' },
        { status: 500 },
      )
    }

    // ── 5. SaaS-side prospect record (best-effort) ─────────────────
    // Doesn't roll back the trial on failure — the user has a working
    // account either way; this row is just for the AutoDex internal
    // sales pipeline.
    try {
      let assignedTo: string | null = null
      try {
        const { data: pickedId } = await admin.rpc('saas_pick_next_prospecteur')
        assignedTo = (pickedId as string | null) ?? null
      } catch { /* ignore — no distribution configured */ }

      await admin.from('super_admin_prospects').insert([{
        full_name,
        phone,
        email:         emailRaw,
        city:          wilaya,
        showroom_name,
        showroom_size,
        suivi:         'nouveau',
        // Source enum doesn't include 'register_page' yet — tag as
        // landing_page; the originating page name is in the email body.
        source:        'landing_page',
        assigned_to:   assignedTo,
        // Lightweight record of the plan picked on the pricing page —
        // the trial itself carries no plan_id (it shapes modules only).
        ...(chosenPlanName ? { notes: `Plan choisi : ${chosenPlanName}` } : {}),
      }]).then(() => {}, () => {})
    } catch { /* ignore */ }

    // ── 6. Emails (best-effort) ────────────────────────────────────
    const trialEndsAtFr = formatDateFr(trialEndsAt)
    const owner = welcomeTrialEmail({
      ownerName:     full_name,
      showroomName:  showroom_name,
      ownerEmail:    emailRaw,
      ownerPassword: password,
      trialEndsAtFr,
    })
    const ownerRes = await sendEmail({
      to:      emailRaw,
      subject: owner.subject,
      text:    owner.text,
      html:    owner.html,
    })

    const internal = internalTrialStartedEmail({
      showroomName: showroom_name,
      endsAtFr:     trialEndsAtFr,
    })
    const internalText = `${internal.text}\nTel: ${phone}\nSource: register_page`
    const internalRes = await sendEmail({
      to:      internalNotifyAddress(),
      subject: internal.subject,
      text:    internalText,
    })

    return NextResponse.json({
      ok:                  true,
      email:               emailRaw,
      showroom_id:         shroom.id,
      trial_ends_at:       trialEndsAt.toISOString(),
      welcome_email_sent:  ownerRes.ok,
      internal_email_sent: internalRes.ok,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
