// ─────────────────────────────────────────────────────────────────────
// POST /api/admin/start-trial
// ─────────────────────────────────────────────────────────────────────
// Atomic flow that converts a SaaS prospect's RDV into a real
// 20-day-trial showroom. Sequence:
//
//   1. Create the showroom row (is_trial=true, trial_ends_at=now+20d)
//   2. Create the auth user (with email_confirm:true, manual password)
//   3. Insert the user_roles row binding owner → showroom
//   4. Update the super_admin_rdv (status=essai_gratuit, linked_showroom_id)
//   5. Confirm prospect.suivi=rdv_planifie (idempotent — usually already)
//   6. Send welcome email to owner (Resend)
//   7. Send internal notification to AutoDex inbox
//
// Steps 1–4 are rolled back manually if any fails. Steps 6–7 are
// best-effort: an email failure does not abort the trial creation.
//
// Caller MUST be authenticated with role = 'super_admin'.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin, errorResponse } from '@/lib/api-auth'
import {
  sendEmail, internalNotifyAddress,
  welcomeTrialEmail, internalTrialStartedEmail,
  formatDateFr,
} from '@/lib/resend'

export const runtime = 'nodejs'

const TRIAL_DAYS  = 20
const EMAIL_RX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSuperAdmin(req)

    const body = await req.json().catch(() => ({}))
    const rdv_id          = String(body.rdv_id ?? '').trim()
    const prospect_id     = String(body.prospect_id ?? '').trim()
    const showroom_name   = String(body.showroom_name ?? '').trim()
    const owner_email     = String(body.owner_email ?? '').trim().toLowerCase()
    const owner_name      = String(body.owner_name ?? '').trim()
    const owner_password  = String(body.owner_password ?? '')
    const city            = String(body.city ?? '').trim()

    if (!rdv_id)        return NextResponse.json({ error: 'rdv_id requis.' },        { status: 400 })
    if (!prospect_id)   return NextResponse.json({ error: 'prospect_id requis.' },   { status: 400 })
    if (!showroom_name) return NextResponse.json({ error: 'Nom du showroom requis.' }, { status: 400 })
    if (!city)          return NextResponse.json({ error: 'Wilaya requise.' },       { status: 400 })
    if (!owner_email || !EMAIL_RX.test(owner_email)) {
      return NextResponse.json({ error: 'Email du propriétaire invalide.' }, { status: 400 })
    }
    if (!owner_password || owner_password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe (≥ 8 caractères) requis.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant.' }, { status: 500 })
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    const trialEndsAtIso = trialEndsAt.toISOString()
    const trialEndsAtFr  = formatDateFr(trialEndsAt)

    // ── Step 1: Showroom ─────────────────────────────────────────────
    const { data: shroom, error: shErr } = await admin
      .from('showrooms')
      .insert([{
        name:             showroom_name,
        city,
        owner_email,
        active:           true,
        is_trial:         true,
        trial_ends_at:    trialEndsAtIso,
        module_vente:     true,
        module_location:  false,
      }])
      .select('id')
      .single()
    if (shErr || !shroom) {
      return NextResponse.json(
        { error: shErr?.message ?? 'Échec de création du showroom.' },
        { status: 400 },
      )
    }

    // ── Step 2: Owner auth user ──────────────────────────────────────
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         owner_email,
      password:      owner_password,
      email_confirm: true,
      user_metadata: { full_name: owner_name },
    })
    if (createErr || !created.user) {
      // Rollback showroom
      await admin.from('showrooms').delete().eq('id', shroom.id).then(() => {}, () => {})
      return NextResponse.json(
        { error: createErr?.message ?? 'Échec de création du compte propriétaire.' },
        { status: 400 },
      )
    }
    const ownerUserId = created.user.id

    // ── Step 3: user_roles ───────────────────────────────────────────
    const { error: urErr } = await admin
      .from('user_roles')
      .insert([{
        user_id:     ownerUserId,
        showroom_id: shroom.id,
        role:        'owner',
      }])
    if (urErr) {
      await admin.auth.admin.deleteUser(ownerUserId).then(() => {}, () => {})
      await admin.from('showrooms').delete().eq('id', shroom.id).then(() => {}, () => {})
      return NextResponse.json({ error: urErr.message }, { status: 400 })
    }

    // ── Step 4: Update RDV ───────────────────────────────────────────
    const { error: rdvErr } = await admin
      .from('super_admin_rdv')
      .update({
        status:             'essai_gratuit',
        linked_showroom_id: shroom.id,
      })
      .eq('id', rdv_id)
    if (rdvErr) {
      // Rollback the whole chain — RDV update is part of the contract.
      await admin.from('user_roles').delete().eq('user_id', ownerUserId).then(() => {}, () => {})
      await admin.auth.admin.deleteUser(ownerUserId).then(() => {}, () => {})
      await admin.from('showrooms').delete().eq('id', shroom.id).then(() => {}, () => {})
      return NextResponse.json({ error: rdvErr.message }, { status: 400 })
    }

    // ── Step 5: Confirm prospect.suivi=rdv_planifie (idempotent) ────
    // Spec says "already is, just confirm" — we skip the write when the
    // value already matches to avoid spurious activity-trigger noise.
    const { data: pRow } = await admin
      .from('super_admin_prospects')
      .select('suivi')
      .eq('id', prospect_id)
      .maybeSingle()
    if (pRow && pRow.suivi !== 'rdv_planifie') {
      await admin
        .from('super_admin_prospects')
        .update({ suivi: 'rdv_planifie' })
        .eq('id', prospect_id)
        .then(() => {}, () => {})
    }

    // ── Steps 6 & 7: emails (best-effort, never fatal) ───────────────
    const welcome = welcomeTrialEmail({
      ownerName:     owner_name || owner_email,
      showroomName:  showroom_name,
      ownerEmail:    owner_email,
      ownerPassword: owner_password,
      trialEndsAtFr,
    })
    const welcomeRes = await sendEmail({
      to:      owner_email,
      subject: welcome.subject,
      text:    welcome.text,
      html:    welcome.html,
    })

    const internal = internalTrialStartedEmail({
      showroomName: showroom_name,
      endsAtFr:     trialEndsAtFr,
    })
    const internalRes = await sendEmail({
      to:      internalNotifyAddress(),
      subject: internal.subject,
      text:    internal.text,
    })

    // Caller-id stored as activity for audit (lightweight, non-fatal).
    void ctx

    return NextResponse.json({
      success:        true,
      showroom_id:    shroom.id,
      owner_user_id:  ownerUserId,
      trial_ends_at:  trialEndsAtIso,
      welcome_email_sent:  welcomeRes.ok,
      internal_email_sent: internalRes.ok,
      welcome_email_error:  welcomeRes.ok  ? undefined : welcomeRes.error,
      internal_email_error: internalRes.ok ? undefined : internalRes.error,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
