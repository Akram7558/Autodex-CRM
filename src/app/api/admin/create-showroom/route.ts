// ─────────────────────────────────────────────────────────────────────
// POST /api/admin/create-showroom
// ─────────────────────────────────────────────────────────────────────
// Server-only endpoint (uses SUPABASE_SERVICE_ROLE_KEY) that creates a
// new tenant in three steps:
//   1. Creates the Supabase auth user (email + auto-generated 12-char password)
//   2. Creates the showroom row
//   3. Creates a user_roles row linking the new user to the showroom as 'owner'
// On failure mid-flow, cleanup is attempted to avoid orphaned rows.
//
// The caller MUST be authenticated and have role = 'super_admin'.
// We never expose the service-role key to the browser — the client just
// POSTs JSON and receives the generated temporary password back so it
// can be displayed once.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs' // service-role key requires Node, not Edge

// Send the welcome email via Resend. Returns true on success, false on
// any failure (the caller decides whether to surface the failure).
async function sendWelcomeEmail(owner_email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' }

  // Plain-text body. Kept simple to avoid an HTML template — admins can
  // upgrade to HTML later if desired.
  const text =
`Bonjour,

Votre compte AutoDex CRM a été créé avec succès.

Voici vos identifiants de connexion :
Email : ${owner_email}
Mot de passe : ${password}

Connectez-vous ici : https://www.autodex.store

Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe après votre première connexion.

Pour toute question, contactez-nous à : support@autodex.store

L'équipe AutoDex`

  const html = `<p>Bonjour,</p>
<p>Votre compte AutoDex CRM a été créé avec succès.</p>
<p><strong>Voici vos identifiants de connexion :</strong><br/>
Email : <code>${owner_email}</code><br/>
Mot de passe : <code>${password}</code></p>
<p>Connectez-vous ici : <a href="https://www.autodex.store">https://www.autodex.store</a></p>
<p>Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe après votre première connexion.</p>
<p>Pour toute question, contactez-nous à : <a href="mailto:support@autodex.store">support@autodex.store</a></p>
<p>— L'équipe AutoDex</p>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM ?? 'AutoDex <noreply@autodex.store>',
        to:      [owner_email],
        subject: 'Bienvenue sur AutoDex — Vos identifiants de connexion',
        text,
        html,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `Resend ${res.status}: ${errText.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const name        = String(body.name        ?? '').trim()
    const city        = String(body.city        ?? '').trim()
    const owner_email = String(body.owner_email ?? '').trim().toLowerCase()
    const password    = String(body.password    ?? '')
    // Explicit module flags from the form are the FINAL word (the UI
    // auto-fills them from the picked plan but the super_admin can
    // override). When ABSENT, the chosen plan's modules apply (resolved
    // below); with no plan either, fall back to the historical default
    // (vente-only).
    const moduleVenteRaw: boolean | undefined =
      typeof body.module_vente === 'boolean' ? body.module_vente : undefined
    const moduleLocationRaw: boolean | undefined =
      typeof body.module_location === 'boolean' ? body.module_location : undefined
    const active          = body.active          !== false   // default true

    // ── Optional paid-from-day-1 fields ─────────────────────────────
    // When the super_admin picks a plan in the creation form, the
    // showroom is provisioned as a paying customer (is_trial=false)
    // with the plan's price + duration as defaults; the form may also
    // override either value.
    const plan_id           = body.plan_id           ? String(body.plan_id) : null
    const contractRaw       = body.contract_amount
    const expiresRaw        = body.expires_at        ? String(body.expires_at).trim() : ''

    if (!name)        return NextResponse.json({ error: 'Nom requis.' },          { status: 400 })
    if (!city)        return NextResponse.json({ error: 'Wilaya requise.' },      { status: 400 })
    if (!owner_email) return NextResponse.json({ error: 'Email propriétaire requis.' }, { status: 400 })
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe (≥ 8 caractères) requis.' }, { status: 400 })
    }

    // ── Verify caller is super_admin ────────────────────────────────
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll().map(({ name, value }) => ({ name, value }))
          },
          // No-op — we only read in this handler.
          setAll() {},
        },
      },
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

    const { data: roleRow } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleRow?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
    }

    // ── Service-role admin client ──────────────────────────────────
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.' },
        { status: 500 },
      )
    }
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── Resolve plan defaults (only when plan_id supplied) ───────────
    // Plan price / duration become the defaults; the body can still
    // override either via contract_amount / expires_at.
    let resolvedAmount: number | null = null
    let resolvedExpires: Date | null = null
    let planModuleVente: boolean | undefined
    let planModuleLocation: boolean | undefined
    if (plan_id) {
      const { data: plan, error: planErr } = await admin
        .from('saas_plans')
        .select('id, price, duration_months, module_vente, module_location')
        .eq('id', plan_id)
        .maybeSingle()
      if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 })
      if (!plan)   return NextResponse.json({ error: 'Plan introuvable.' }, { status: 404 })
      resolvedAmount = Number(plan.price)
      const ends = new Date()
      ends.setMonth(ends.getMonth() + Number(plan.duration_months))
      resolvedExpires = ends
      // Plan modules (migration 57) — used only when the body didn't
      // carry explicit flags. Null columns → classique semantics.
      const pm = plan as { module_vente?: boolean | null; module_location?: boolean | null }
      planModuleVente    = pm.module_vente !== false
      planModuleLocation = pm.module_location === true
    }

    // Final module flags: explicit body > plan-derived > historical default.
    const module_vente    = moduleVenteRaw    ?? planModuleVente    ?? true
    const module_location = moduleLocationRaw ?? planModuleLocation ?? false

    const bodyAmount = Number(contractRaw)
    const contract_amount: number | null =
      contractRaw !== undefined && Number.isFinite(bodyAmount)
        ? bodyAmount
        : resolvedAmount
    if (contract_amount !== null && contract_amount < 0) {
      return NextResponse.json({ error: 'Montant du contrat invalide.' }, { status: 400 })
    }

    let expires: Date | null = null
    if (expiresRaw) {
      const parsed = new Date(expiresRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Date d\'expiration invalide.' }, { status: 400 })
      }
      expires = parsed
    } else if (resolvedExpires) {
      expires = resolvedExpires
    }
    // Plan must come with an expiry — server falls back to plan-derived
    // when the body doesn't provide one. If neither, we keep showroom
    // unpaid (plan_id stays null).
    if (plan_id && !expires) {
      return NextResponse.json({ error: 'Date d\'expiration requise pour ce plan.' }, { status: 400 })
    }

    // 1. Create auth user with the password supplied by the super admin.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         owner_email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? 'Échec de création du compte.' },
        { status: 400 },
      )
    }
    const newUserId = created.user.id

    // 2. Create the showroom row. When a plan was picked, mark the
    // showroom as a paying customer from day 1 (is_trial=false, with
    // trial_ends_at repurposed as the subscription end date — same
    // convention used by ConvertTrialModal).
    const showroomInsert: Record<string, unknown> = {
      name,
      city,
      owner_email,
      module_vente,
      module_location,
      active,
    }
    if (plan_id) {
      showroomInsert.plan_id              = plan_id
      showroomInsert.is_trial             = false
      showroomInsert.trial_ends_at        = expires!.toISOString()
      showroomInsert.trial_contract_amount = contract_amount
      showroomInsert.trial_converted_at   = new Date().toISOString()
      showroomInsert.trial_converted_by   = user.id
    }
    const { data: shroom, error: shErr } = await admin
      .from('showrooms')
      .insert([showroomInsert])
      .select('id')
      .single()
    if (shErr || !shroom) {
      // Rollback the auth user so we don't leave an orphan account.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return NextResponse.json(
        { error: shErr?.message ?? 'Échec de création du showroom.' },
        { status: 400 },
      )
    }

    // 3. Create the user_roles binding (role = 'owner').
    const { error: urErr } = await admin
      .from('user_roles')
      .insert([{
        user_id:     newUserId,
        showroom_id: shroom.id,
        role:        'owner',
      }])
    if (urErr) {
      // Rollback the showroom + the auth user.
      await admin.from('showrooms').delete().eq('id', shroom.id).throwOnError().then(() => {}, () => {})
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return NextResponse.json({ error: urErr.message }, { status: 400 })
    }

    // 4. Send the welcome email with the credentials. We do this AFTER the
    //    rows are persisted so a transient email failure doesn't abort the
    //    whole flow — the client decides whether to surface the password
    //    for manual delivery instead.
    const mail = await sendWelcomeEmail(owner_email, password)

    return NextResponse.json({
      ok:           true,
      showroom_id:  shroom.id,
      owner_email,
      email_sent:   mail.ok,
      email_error:  mail.ok ? undefined : mail.error,
      // Only echoed back when email failed, so the super admin can deliver
      // credentials manually. NEVER returned on success.
      temp_password: mail.ok ? undefined : password,
      // Echo the chosen plan + paid expiry so the UI can confirm the
      // showroom was created in paid mode.
      plan_id:      plan_id ?? null,
      expires_at:   expires ? expires.toISOString() : null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
