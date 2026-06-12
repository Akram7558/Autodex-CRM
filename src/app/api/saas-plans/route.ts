// ─────────────────────────────────────────────────────────────────────
// /api/saas-plans
//   GET  — public read (used by the public landing Tarifs section AND
//          the Super-Admin Plans Manager). Returns:
//            { plans: SaasPlan[], grouped: { classique: [], totale: [] } }
//          - plans:   ALL plans (active + inactive) — used by admin UI
//          - grouped: only ACTIVE plans, ordered by duration_months ASC,
//                     split by plan_type — used by the public landing.
//   PUT  — upsert plans (super_admin only). Now accepts plan_type.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin, errorResponse } from '@/lib/api-auth'
import {
  SAAS_PLAN_TYPE_VALUES,
  type SaasPlan, type SaasPlanType,
} from '@/lib/types'

export const runtime = 'nodejs'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Service role key missing.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── GET ─────────────────────────────────────────────────────────────
// PUBLIC. The plan catalogue is non-sensitive (it's marketing copy
// shown on the landing page). RLS on saas_plans already allows SELECT
// to all authenticated users, but we want anonymous landing visitors
// to see prices too — so this route returns plans via the service-role
// client without checking auth.
export async function GET() {
  try {
    const admin = adminClient()
    const { data, error } = await admin
      .from('saas_plans')
      .select('*')
      .order('plan_type', { ascending: true })
      .order('duration_months', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const plans = (data ?? []) as SaasPlan[]

    // Build the grouped view (active only, ordered by duration). Each
    // group is empty if there's no active plan of that type.
    const grouped: Record<SaasPlanType, SaasPlan[]> = { classique: [], totale: [], location: [] }
    for (const p of plans) {
      if (!p.active) continue
      const t = (p.plan_type ?? 'classique') as SaasPlanType
      if (grouped[t]) grouped[t].push(p)
    }

    return NextResponse.json({ plans, grouped })
  } catch (err) {
    return errorResponse(err)
  }
}

// ── PUT ─────────────────────────────────────────────────────────────
// Body: { plans: [{ id?, name, duration_months, price, active, plan_type }] }
// Each entry without `id` is inserted; entries with `id` are updated.
// Returns the canonical post-write list (flat + grouped).
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
      plan_type: SaasPlanType
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
      const plan_type = (raw.plan_type ? String(raw.plan_type) : 'classique') as SaasPlanType
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
      if (!SAAS_PLAN_TYPE_VALUES.includes(plan_type)) {
        return NextResponse.json(
          { error: `Type de plan invalide pour "${name}".` },
          { status: 400 },
        )
      }
      cleaned.push({
        id: raw.id ? String(raw.id) : undefined,
        name,
        duration_months,
        price,
        active,
        plan_type,
      })
    }

    const admin = adminClient()
    const inserts = cleaned.filter(p => !p.id)
    const updates = cleaned.filter((p): p is Entry & { id: string } => !!p.id)

    // The plan's module columns are DERIVED from its tier (same mapping as
    // the migration-57 backfill): classique → vente-only, location →
    // location-only, totale → both. Written on every insert AND update so
    // retyping a plan (e.g. classique → location) reconciles the columns —
    // provisioning (direct-convert / create-showroom / register) derives
    // showroom modules from these, so they must never go stale.
    const modulesFor = (t: SaasPlanType) => ({
      module_vente:    t !== 'location',
      module_location: t !== 'classique',
    })

    if (inserts.length > 0) {
      const { error } = await admin.from('saas_plans').insert(inserts.map(p => ({
        name:            p.name,
        duration_months: p.duration_months,
        price:           p.price,
        active:          p.active,
        plan_type:       p.plan_type,
        ...modulesFor(p.plan_type),
      })))
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    for (const u of updates) {
      const { error } = await admin.from('saas_plans').update({
        name:            u.name,
        duration_months: u.duration_months,
        price:           u.price,
        active:          u.active,
        plan_type:       u.plan_type,
        ...modulesFor(u.plan_type),
      }).eq('id', u.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { data, error: fetchErr } = await admin
      .from('saas_plans')
      .select('*')
      .order('plan_type', { ascending: true })
      .order('duration_months', { ascending: true })
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const plans = (data ?? []) as SaasPlan[]
    const grouped: Record<SaasPlanType, SaasPlan[]> = { classique: [], totale: [], location: [] }
    for (const p of plans) {
      if (!p.active) continue
      const t = (p.plan_type ?? 'classique') as SaasPlanType
      if (grouped[t]) grouped[t].push(p)
    }

    return NextResponse.json({ success: true, plans, grouped })
  } catch (err) {
    return errorResponse(err)
  }
}
