// ─────────────────────────────────────────────────────────────────────
// POST /api/employees/create
// ─────────────────────────────────────────────────────────────────────
// Provisions a showroom-team account (manager / closer / prospecteur)
// under the caller's showroom.
//
// Owner   → can create manager / closer / prospecteur
// Manager → can create closer / prospecteur (NOT manager)
// Others  → 403
//
// Atomic flow with manual rollback (same pattern as start-trial):
//   1. auth.admin.createUser
//   2. INSERT user_roles (showroom_id = caller's, created_by = caller)
//   3. Welcome email (best-effort — failure does not roll back)
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import { tryNormalizePhone } from '@/lib/phone'
import {
  allowedCreatableRolesForCaller,
  isShowroomEmployeeRole,
  ROLE_LABEL_FR,
} from '@/lib/employee-helpers'

export const runtime = 'nodejs'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function sendWelcome(opts: {
  to:           string
  name:         string
  password:     string
  role:         'manager' | 'closer' | 'prospecteur'
  showroomName: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' }

  const greet = opts.name?.trim() ? `Bonjour ${opts.name.trim()},` : 'Bonjour,'
  const roleLabel = ROLE_LABEL_FR[opts.role]
  const subject = `Bienvenue sur AutoDex — ${opts.showroomName}`

  const text =
`${greet}

Votre compte AutoDex a été créé par ${opts.showroomName}.

Rôle : ${roleLabel}

Identifiants de connexion :
Email        : ${opts.to}
Mot de passe : ${opts.password}

Connectez-vous ici : https://www.autodex.store

Pour des raisons de sécurité, changez votre mot de passe après la première connexion.

Pour toute question : support@autodex.store

— L'équipe AutoDex`

  const html =
`<p>${greet}</p>
<p>Votre compte AutoDex a été créé par <strong>${opts.showroomName}</strong>.</p>
<p><strong>Rôle :</strong> ${roleLabel}</p>
<p><strong>Identifiants de connexion :</strong><br/>
Email : <code>${opts.to}</code><br/>
Mot de passe : <code>${opts.password}</code></p>
<p>Connectez-vous ici : <a href="https://www.autodex.store">https://www.autodex.store</a></p>
<p>Pour des raisons de sécurité, changez votre mot de passe après la première connexion.</p>
<p>Pour toute question : <a href="mailto:support@autodex.store">support@autodex.store</a></p>
<p>— L'équipe AutoDex</p>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM ?? 'AutoDex <noreply@autodex.store>',
        to:      [opts.to],
        subject, text, html,
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
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')

    const allowed = allowedCreatableRolesForCaller(ctx.role)
    if (allowed.length === 0) {
      throw new ApiError(403, "Vous n'avez pas les droits pour créer des employés.")
    }

    const body = await req.json().catch(() => ({}))
    const full_name = String(body.full_name ?? '').trim()
    const email     = String(body.email     ?? '').trim().toLowerCase()
    const password  = String(body.password  ?? '')
    const phoneRaw  = body.phone ? String(body.phone).trim() : ''
    const role      = body.role

    if (!full_name) throw new ApiError(400, 'Nom complet requis.')
    if (!email)     throw new ApiError(400, 'Email requis.')
    if (!password || password.length < 8) {
      throw new ApiError(400, 'Mot de passe (≥ 8 caractères) requis.')
    }
    if (!isShowroomEmployeeRole(role) || !allowed.includes(role)) {
      throw new ApiError(403, "Rôle non autorisé pour votre niveau d'accès.")
    }
    const phone = phoneRaw ? (tryNormalizePhone(phoneRaw) ?? phoneRaw) : null

    const admin = adminClient()

    // Pre-check: email already in auth?
    {
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      // listUsers doesn't have a direct filter; scan within reasonable limits.
      for (const u of existing?.users ?? []) {
        if ((u.email ?? '').toLowerCase() === email) {
          throw new ApiError(409, 'Un compte avec cet email existe déjà.')
        }
      }
    }

    // 1. Create the auth user.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, ...(phone ? { phone } : {}) },
    })
    if (createErr || !created.user) {
      throw new ApiError(400, createErr?.message ?? 'Échec de création du compte.')
    }
    const newUserId = created.user.id

    // 2. INSERT user_roles. Rollback the auth user on failure.
    const { error: urErr } = await admin
      .from('user_roles')
      .insert([{
        user_id:     newUserId,
        showroom_id: ctx.showroomId,
        role,
        created_by:  ctx.user.id,
      }])
    if (urErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      throw new ApiError(400, urErr.message)
    }

    // 3. Welcome email — best-effort.
    const { data: sr } = await admin
      .from('showrooms').select('name').eq('id', ctx.showroomId).maybeSingle()
    const showroomName = (sr?.name as string) ?? 'AutoDex'

    const mail = await sendWelcome({
      to:           email,
      name:         full_name,
      password,
      role,
      showroomName,
    })

    return NextResponse.json({
      success:      true,
      user_id:      newUserId,
      email,
      role,
      email_sent:   mail.ok,
      email_error:  mail.ok ? undefined : mail.error,
      // Echo the password back to the caller only when delivery failed,
      // so the creator can hand it off manually.
      temp_password: mail.ok ? undefined : password,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
