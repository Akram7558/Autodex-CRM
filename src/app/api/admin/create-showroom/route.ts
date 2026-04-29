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

// 12-char password with mixed letters + digits, avoiding ambiguous chars (0/O/1/l).
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  // Crypto-grade randomness in Node's runtime.
  const buf = new Uint8Array(12)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) {
    out += alphabet[buf[i] % alphabet.length]
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const name        = String(body.name        ?? '').trim()
    const city        = String(body.city        ?? '').trim()
    const owner_email = String(body.owner_email ?? '').trim().toLowerCase()
    const module_vente    = body.module_vente    !== false   // default true
    const module_location = body.module_location === true    // default false
    const active          = body.active          !== false   // default true

    if (!name)        return NextResponse.json({ error: 'Nom requis.' },          { status: 400 })
    if (!city)        return NextResponse.json({ error: 'Wilaya requise.' },      { status: 400 })
    if (!owner_email) return NextResponse.json({ error: 'Email propriétaire requis.' }, { status: 400 })

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

    // 1. Create auth user.
    const tempPassword = generateTempPassword()
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         owner_email,
      password:      tempPassword,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? 'Échec de création du compte.' },
        { status: 400 },
      )
    }
    const newUserId = created.user.id

    // 2. Create the showroom row.
    const { data: shroom, error: shErr } = await admin
      .from('showrooms')
      .insert([{
        name,
        city,
        owner_email,
        module_vente,
        module_location,
        active,
      }])
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

    return NextResponse.json({
      ok:            true,
      showroom_id:   shroom.id,
      owner_email,
      temp_password: tempPassword,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
