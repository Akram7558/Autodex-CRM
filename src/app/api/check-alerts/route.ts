import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser, errorResponse } from '@/lib/api-auth'

// ─────────────────────────────────────────────────────────────
// POST /api/check-alerts
//
// Exécute les 4 règles d'alertes et insère les notifications
// manquantes dans la table `notifications`. Idempotent grâce
// à la colonne UNIQUE `dedupe_key`.
//
// Body (optionnel) :
//   { userId?: string } — pour la règle 3 (vendeur inactif)
// ─────────────────────────────────────────────────────────────

const HOURS = 60 * 60 * 1000
const DAYS = 24 * HOURS

type LeadRow = {
  id: string
  showroom_id: string | null
  assigned_to: string | null
  full_name: string
  model_wanted: string | null
  status: string
  created_at: string
  updated_at: string
}

type VehicleRow = {
  id: string
  showroom_id: string | null
  brand: string
  model: string
  status: string
}

type NotifInsert = {
  showroom_id: string | null
  user_id: string | null
  type: 'lead_ignored' | 'lead_stagnant' | 'stock_rupture' | 'vendor_inactive'
  title: string
  message: string
  lead_id: string | null
  vehicle_id: string | null
  dedupe_key: string
}

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Bucket a timestamp to an hour so dedupe_key stays stable for
// roughly one hour, then a fresh alert can appear.
function hourBucket(ts: Date) {
  return Math.floor(ts.getTime() / HOURS)
}

function dayBucket(ts: Date) {
  return Math.floor(ts.getTime() / DAYS)
}

export async function POST(req: NextRequest) {
  // Authentication only — the alert engine intentionally scans across
  // all showrooms (each notification carries its own showroom_id), so
  // we don't enforce showroom membership here. But we still require the
  // caller to be a logged-in user, since this route uses the service
  // role and could otherwise be invoked anonymously to spam the
  // notifications table.
  try {
    await requireUser(req)
  } catch (err) {
    return errorResponse(err)
  }

  let userId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.userId === 'string') userId = body.userId
  } catch {
    /* ignore */
  }

  const sb = supa()
  const now = new Date()
  const toInsert: NotifInsert[] = []

  // ── Rule 1 — Leads 'new' older than 48h ───────────────────
  const cutoff48h = new Date(now.getTime() - 48 * HOURS).toISOString()
  const r1 = await sb
    .from('leads')
    .select('id, showroom_id, assigned_to, full_name, model_wanted, status, created_at, updated_at')
    .eq('status', 'new')
    .lt('created_at', cutoff48h)

  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 })

  for (const lead of (r1.data ?? []) as LeadRow[]) {
    const hours = Math.round((now.getTime() - new Date(lead.created_at).getTime()) / HOURS)
    const model = lead.model_wanted ? ` — ${lead.model_wanted}` : ''
    toInsert.push({
      showroom_id: lead.showroom_id,
      user_id: lead.assigned_to,
      type: 'lead_ignored',
      title: 'Lead ignoré depuis plus de 48 h',
      message: `M. ${lead.full_name} attend depuis ${hours} h${model}`,
      lead_id: lead.id,
      vehicle_id: null,
      dedupe_key: `lead_ignored:${lead.id}:${hourBucket(now)}`,
    })
  }

  // ── Rule 2 — Leads 'contacted' not updated for 5 days ─────
  const cutoff5d = new Date(now.getTime() - 5 * DAYS).toISOString()
  const r2 = await sb
    .from('leads')
    .select('id, showroom_id, assigned_to, full_name, model_wanted, status, created_at, updated_at')
    .eq('status', 'contacted')
    .lt('updated_at', cutoff5d)

  if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 })

  for (const lead of (r2.data ?? []) as LeadRow[]) {
    toInsert.push({
      showroom_id: lead.showroom_id,
      user_id: lead.assigned_to,
      type: 'lead_stagnant',
      title: 'Lead sans évolution',
      message: `Lead ${lead.full_name} sans évolution depuis 5 jours`,
      lead_id: lead.id,
      vehicle_id: null,
      dedupe_key: `lead_stagnant:${lead.id}:${dayBucket(now)}`,
    })
  }

  // ── Rule 3 — Vendor with 0 activities today ───────────────
  if (userId) {
    const dayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString()
    const r3 = await sb
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayStart)
    if (!r3.error && (r3.count ?? 0) === 0) {
      // notifications.showroom_id is NOT NULL after migration_14 — resolve
      // it via the user's role row before queueing the alert.
      const ur = await sb
        .from('user_roles')
        .select('showroom_id')
        .eq('user_id', userId)
        .maybeSingle()
      const userShowroom = (ur.data?.showroom_id as string | null) ?? null
      if (userShowroom) {
        toInsert.push({
          showroom_id: userShowroom,
          user_id: userId,
          type: 'vendor_inactive',
          title: 'Aucune activité aujourd’hui',
          message: 'Vous n’avez encore rien enregistré aujourd’hui — pensez à logger vos appels.',
          lead_id: null,
          vehicle_id: null,
          dedupe_key: `vendor_inactive:${userId}:${dayBucket(now)}`,
        })
      }
    }
  }

  // ── Rule 4 — Stock rupture ────────────────────────────────
  // Pour chaque (brand, model) où aucun véhicule n'est 'available',
  // vérifier si au moins un lead désire ce modèle.
  const r4a = await sb
    .from('vehicles')
    .select('id, showroom_id, brand, model, status')

  if (!r4a.error) {
    const vehicles = (r4a.data ?? []) as VehicleRow[]
    // Group by brand+model
    const byModel = new Map<
      string,
      { available: number; total: number; brand: string; model: string; showroom_id: string | null }
    >()
    for (const v of vehicles) {
      const k = `${v.brand.toLowerCase()}|${v.model.toLowerCase()}`
      const cur = byModel.get(k) ?? {
        available: 0, total: 0, brand: v.brand, model: v.model, showroom_id: v.showroom_id,
      }
      cur.total += 1
      if (v.status === 'available') cur.available += 1
      byModel.set(k, cur)
    }

    for (const [, info] of byModel) {
      if (info.total > 0 && info.available === 0) {
        // Leads wanting this model?
        const r4b = await sb
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .ilike('model_wanted', `%${info.model}%`)
        const demand = r4b.count ?? 0
        if (demand > 0) {
          toInsert.push({
            showroom_id: info.showroom_id,
            user_id: null,
            type: 'stock_rupture',
            title: 'Rupture de stock',
            message: `Aucun ${info.brand} ${info.model} disponible — ${demand} lead(s) en attente`,
            lead_id: null,
            vehicle_id: null,
            dedupe_key: `stock_rupture:${info.brand}:${info.model}:${dayBucket(now)}`,
          })
        }
      }
    }
  }

  // ── Insert with ON CONFLICT DO NOTHING on dedupe_key ──────
  // Drop any row missing showroom_id — notifications.showroom_id is now
  // NOT NULL (migration_14) and we'd rather skip than abort the batch.
  const safeInserts = toInsert.filter(n => n.showroom_id)
  let created = 0
  if (safeInserts.length) {
    const { data, error } = await sb
      .from('notifications')
      .upsert(safeInserts, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    created = data?.length ?? 0
  }

  return NextResponse.json({
    ok: true,
    checked: safeInserts.length,
    created,
    rules: { r1: r1.data?.length ?? 0, r2: r2.data?.length ?? 0 },
  })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: 'POST this endpoint to run the 4 alert rules.',
  })
}
