// ─────────────────────────────────────────────────────────────────────
// /api/saas-plans
//   GET  — read active plans (any internal user)
//   PUT  — upsert plans (super_admin only)
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  requireInternalUser, requireSuperAdmin, errorResponse,
} from '@/lib/api-auth'

export const runtime = 'nodejs'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Service role key missing.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── GET ─────────────────────────────────────────────────────────────
// Returns all plans (active + inactive) so the parametres page can
// render the full editable list. Active-only consumers (the convert
// modal, the public catalogue) filter client-side.
export async function GET(req: NextRequest) {
  try {
    await requireInternalUser(req)
    const admin = adminClient()
    const { data, error } = await admin
      .from('saas_plans')
      .select('*')
      .order('duration_months', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ plans: data ?? [] })
  } catch (err) {
    return errorResponse(err)
  }
}

// ── PUT ─────────────────────────────────────────────────────────────
// Body: { plans: [{ id?, name, duration_months, price, active }] }
// Each entry without `id` is inserted; entries with `id` are updated.
// Returns the canonical post-write list.
export async function PUT(req: NextRequest) {
  try {
    await requireSuperAdmin(req)
    const body = await req.json().catch(() => ({}))
    const incoming = Array.isArray(body?.plans) ? body.plans : null
    if (!incoming) return NextResponse.json({ error: 'plans[] requis.' }, { status: 400 })

    type Entry = {
      id?: string
      name: string
      duration_months: number
      price: number
      active: boolean
    }
    const cleaned: Entry[] = []
    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ error: 'Plan invalide.' }, { status: 400 })
      }
      const name = String(raw.name ?? '').trim()
      const duration_months = Number(raw.duration_months)
      const price = Number(raw.price)
      const active = raw.active !== false
      if (!name) {
        return NextResponse.json({ error: 'Nom du plan requis.' }, { status: 400 })
      }
      if (!Number.isInteger(duration_months) || duration_months <= 0) {
        return NextResponse.json(
          { error: `Durée invalide pour "${name}" (entier > 0 attendu).` },
          { status: 400 },
        )
      }
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { error: `Prix invalide pour "${name}".` },
          { status: 400 },
        )
      }
      cleaned.push({
        id: raw.id ? String(raw.id) : undefined,
        name,
        duration_months,
        price,
        active,
      })
    }

    const admin = adminClient()

    // Two passes: insert rows without id, update rows with id. Keeps
    // each row deterministic — no surprise FK churn from bulk upserts.
    const inserts = cleaned.filter(p => !p.id)
    const updates = cleaned.filter((p): p is Entry & { id: string } => !!p.id)

    if (inserts.length > 0) {
      const { error } = await admin.from('saas_plans').insert(inserts.map(p => ({
        name:            p.name,
        duration_months: p.duration_months,
        price:           p.price,
        active:          p.active,
      })))
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    for (const u of updates) {
      const { error } = await admin.from('saas_plans').update({
        name:            u.name,
        duration_months: u.duration_months,
        price:           u.price,
        active:          u.active,
      }).eq('id', u.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { data, error: fetchErr } = await admin
      .from('saas_plans')
      .select('*')
      .order('duration_months', { ascending: true })
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    return NextResponse.json({ success: true, plans: data ?? [] })
  } catch (err) {
    return errorResponse(err)
  }
}
