// ─────────────────────────────────────────────────────────────────────
// POST /api/admin/create-internal-user
// ─────────────────────────────────────────────────────────────────────
// Provisions a NEW AutoDex internal-team account: super_admin,
// commercial, or prospecteur_saas. Internal users never carry a
// showroom_id (enforced by the user_roles_internal_no_showroom CHECK).
//
// Caller must be authenticated AND have role = 'super_admin'.
// Service-role key is used only inside this route (never client-side).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type InternalRole = 'super_admin' | 'commercial' | 'prospecteur_saas'
const INTERNAL_ROLES: InternalRole[] = ['super_admin', 'commercial', 'prospecteur_saas']

const ROLE_LABEL_FR: Record<InternalRole, string> = {
  super_admin:      'Super Admin',
  commercial:       'Commercial',
  prospecteur_saas: 'Prospecteur SaaS',
}

async function sendInternalWelcomeEmail(opts: {
  to:       string
  name:     string
  password: string
  role:     InternalRole
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' }

  const greet = opts.name?.trim() ? `Bonjour ${opts.name.trim()},` : 'Bonjour,'
  const roleLabel = ROLE_LABEL_FR[opts.role]

  const text =
`${greet}

Votre compte AutoDex (équipe interne) a été créé avec succès.

Rôle : ${roleLabel}

Voici vos identifiants de connexion :
Email : ${opts.to}
Mot de passe : ${opts.password}

Connectez-vous ici : https://www.autodex.store

Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe après votre première connexion.

Pour toute question, contactez-nous à : support@autodex.store

L'équipe AutoDex`

  const html = `<p>${greet}</p>
<p>Votre compte AutoDex (équipe interne) a été créé avec succès.</p>
<p><strong>Rôle :</strong> ${roleLabel}</p>
<p><strong>Voici vos identifiants de connexion :</strong><br/>
Email : <code>${opts.to}</code><br/>
Mot de passe : <code>${opts.password}</code></p>
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
        to:      [opts.to],
        subject: `Bienvenue sur AutoDex — Accès ${roleLabel}`,
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
    const email    = String(body.email    ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const role     = String(body.role     ?? '') as InternalRole
    const name     = String(body.name     ?? '').trim()

    if (!email)                       return NextResponse.json({ error: 'Email requis.' },                      { status: 400 })
    if (!password || password.length < 8) return NextResponse.json({ error: 'Mot de passe (≥ 8 caractères) requis.' }, { status: 400 })
    if (!INTERNAL_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 })
    }

    // ── Verify caller is super_admin ────────────────────────────────
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll().map(({ name, value }) => ({ name, value })) },
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
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant.' }, { status: 500 })
    }
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 1. Create the auth user (with optional name as user metadata).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { full_name: name } : undefined,
    })
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? 'Échec de création du compte.' },
        { status: 400 },
      )
    }
    const newUserId = created.user.id

    // 2. Insert the user_roles row. Internal team members never carry a
    //    showroom_id (CHECK constraint user_roles_internal_no_showroom).
    const { error: urErr } = await admin
      .from('user_roles')
      .insert([{ user_id: newUserId, showroom_id: null, role }])
    if (urErr) {
      // Roll back the auth user so we don't leave an orphan account.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return NextResponse.json({ error: urErr.message }, { status: 400 })
    }

    // 3. Send the welcome email. Failures don't roll back — the caller
    //    can deliver credentials manually if Resend is misconfigured.
    const mail = await sendInternalWelcomeEmail({ to: email, name, password, role })

    return NextResponse.json({
      ok:           true,
      user_id:      newUserId,
      email,
      role,
      email_sent:   mail.ok,
      email_error:  mail.ok ? undefined : mail.error,
      // Echo back the password only when email failed, so the super
      // admin can deliver it manually. Never returned on success.
      temp_password: mail.ok ? undefined : password,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
