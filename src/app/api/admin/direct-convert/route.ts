// ─────────────────────────────────────────────────────────────────────
// POST /api/admin/direct-convert
// ─────────────────────────────────────────────────────────────────────
// Atomic flow that converts a SaaS prospect's RDV directly into a paid
// showroom — used when there's no trial in flight (no linked_showroom_id
// on the RDV). Sequence:
//
//   1. Resolve the chosen plan (price + duration).
//   2. Create the auth user (with email_confirm:true).
//   3. Insert the showroom row (is_trial=false, plan stamped, paid).
//   4. Insert user_roles (owner → showroom).
//   5. Update super_admin_rdv (status='converti', linked_showroom_id).
//   6. Send welcome email to owner + internal notification (best-effort).
//
// Steps 2–5 are rolled back manually on any failure to avoid orphans.
// Caller MUST be authenticated with role = 'super_admin'.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin, errorResponse } from '@/lib/api-auth'
import {
  sendEmail, internalNotifyAddress,
  welcomePaidEmail, internalDirectConvertEmail,
  formatDateFr,
} from '@/lib/resend'
import { tryNormalizePhone } from '@/lib/phone'

export const runtime = 'nodejs'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatDzd(n: number): string {
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSuperAdmin(req)

    const body = await req.json().catch(() => ({}))
    const rdv_id          = String(body.rdv_id ?? '').trim()
    const prospect_id     = body.prospect_id ? String(body.prospect_id) : null
    const showroom_name   = String(body.showroom_name ?? '').trim()
    const owner_email     = String(body.owner_email ?? '').trim().toLowerCase()
    const owner_name      = String(body.owner_name ?? '').trim()
    const owner_password  = String(body.owner_password ?? '')
    const phoneRaw        = body.owner_phone ? String(body.owner_phone) : null
    const phone           = phoneRaw ? tryNormalizePhone(phoneRaw) : null
    const city            = body.city ? String(body.city).trim() : null
    const plan_id         = String(body.plan_id ?? '').trim()
    const contractRaw     = body.contract_amount
    const expiresRaw      = body.expires_at ? String(body.expires_at).trim() : ''

    if (!rdv_id)         return NextResponse.json({ error: 'rdv_id requis.' },         { status: 400 })
    if (!showroom_name)  return NextResponse.json({ error: 'Nom du showroom requis.' }, { status: 400 })
    if (!owner_email || !EMAIL_RX.test(owner_email)) {
      return NextResponse.json({ error: 'Email du propriétaire invalide.' }, { status: 400 })
    }
    if (!owner_password || owner_password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe (≥ 8 caractères) requis.' }, { status: 400 })
    }
    if (!plan_id) {
      return NextResponse.json({ error: 'Plan requis pour la conversion directe.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant.' }, { status: 500 })
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 1. Resolve plan (price + duration as defaults, modules) ──────
    const { data: plan, error: planErr } = await admin
      .from('saas_plans')
      .select('id, name, price, duration_months, module_vente, module_location')
      .eq('id', plan_id)
      .maybeSingle()
    if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 })
    if (!plan)   return NextResponse.json({ error: 'Plan introuvable.' }, { status: 404 })

    // Modules come from the chosen plan (migration 57): classique →
    // vente-only, location → location-only, totale → both. Null/absent
    // columns fall back to the historical default (vente-only).
    const planModules = plan as { module_vente?: boolean | null; module_location?: boolean | null }
    const module_vente    = planModules.module_vente !== false
    const module_location = planModules.module_location === true

    const bodyAmount = Number(contractRaw)
    const contract_amount = Number.isFinite(bodyAmount) ? bodyAmount : Number(plan.price)
    if (!Number.isFinite(contract_amount) || contract_amount < 0) {
      return NextResponse.json({ error: 'Montant du contrat invalide.' }, { status: 400 })
    }

    let expires: Date
    if (expiresRaw) {
      const parsed = new Date(expiresRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Date d\'expiration invalide.' }, { status: 400 })
      }
      expires = parsed
    } else {
      const ends = new Date()
      ends.setMonth(ends.getMonth() + Number(plan.duration_months))
      expires = ends
    }

    // ── 2. Create auth user ─────────────────────────────────────────
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         owner_email,
      password:      owner_password,
      email_confirm: true,
    })
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? 'Échec de création du compte.' },
        { status: 400 },
      )
    }
    const newUserId = created.user.id

    // ── 3. Create the showroom (paid from day 1) ────────────────────
    const { data: shroom, error: shErr } = await admin
      .from('showrooms')
      .insert([{
        name:                  showroom_name,
        city,
        owner_email,
        active:                true,
        module_vente,
        module_location,
        is_trial:              false,
        plan_id:               plan.id,
        trial_ends_at:         expires.toISOString(),
        trial_contract_amount: contract_amount,
        trial_converted_at:    new Date().toISOString(),
        trial_converted_by:    ctx.user.id,
      }])
      .select('id')
      .single()
    if (shErr || !shroom) {
      // Roll back the auth user.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return NextResponse.json(
        { error: shErr?.message ?? 'Échec de création du showroom.' },
        { status: 400 },
      )
    }

    // ── 4. Owner role ───────────────────────────────────────────────
    const { error: urErr } = await admin
      .from('user_roles')
      .insert([{
        user_id:     newUserId,
        showroom_id: shroom.id,
        role:        'owner',
      }])
    if (urErr) {
      await admin.from('showrooms').delete().eq('id', shroom.id).throwOnError().then(() => {}, () => {})
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return NextResponse.json({ error: urErr.message }, { status: 400 })
    }

    // ── 5. Link the RDV (status='converti', linked_showroom_id) ─────
    const { error: rdvErr } = await admin
      .from('super_admin_rdv')
      .update({
        status:              'converti',
        linked_showroom_id:  shroom.id,
      })
      .eq('id', rdv_id)
    if (rdvErr) {
      // Soft rollback — keep the showroom + user (they were created
      // correctly), but surface the linkage failure so the operator
      // can retry it manually.
      console.warn('[direct-convert] RDV link failed:', rdvErr.message)
      return NextResponse.json({
        ok:           true,
        showroom_id:  shroom.id,
        owner_user_id: newUserId,
        warning:      `Showroom créé mais le RDV n'a pas pu être lié : ${rdvErr.message}`,
      })
    }

    // Lift the prospect's suivi to rdv_planifie if it isn't already
    // (defensive — keeps the prospect's lifecycle consistent).
    if (prospect_id) {
      await admin.from('super_admin_prospects')
        .update({ suivi: 'rdv_planifie' })
        .eq('id', prospect_id)
        .then(() => {}, () => {})
    }

    // ── 6. Emails (best-effort) ─────────────────────────────────────
    const expiresFr = formatDateFr(expires)
    const tplOwner = welcomePaidEmail({
      ownerName:    owner_name || owner_email.split('@')[0],
      showroomName: showroom_name,
      ownerEmail:   owner_email,
      ownerPassword: owner_password,
      planName:     String(plan.name),
      expiresAtFr:  expiresFr,
    })
    const ownerRes = await sendEmail({
      to:      owner_email,
      subject: tplOwner.subject,
      text:    tplOwner.text,
      html:    tplOwner.html,
    })

    const internal = internalDirectConvertEmail({
      showroomName:   showroom_name,
      planName:       String(plan.name),
      contractAmount: formatDzd(contract_amount),
      expiresAtFr:    expiresFr,
    })
    const internalText = phone ? `${internal.text}\nTel: ${phone}` : internal.text
    const internalRes = await sendEmail({
      to:      internalNotifyAddress(),
      subject: internal.subject,
      text:    internalText,
    })

    return NextResponse.json({
      success:                true,
      showroom_id:            shroom.id,
      owner_user_id:          newUserId,
      expires_at:             expires.toISOString(),
      contract_amount,
      plan_id:                plan.id,
      welcome_email_sent:     ownerRes.ok,
      welcome_email_error:    ownerRes.ok ? undefined : ownerRes.error,
      internal_email_sent:    internalRes.ok,
      internal_email_error:   internalRes.ok ? undefined : internalRes.error,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
