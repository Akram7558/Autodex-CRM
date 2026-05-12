// ─────────────────────────────────────────────────────────────────────
// GET  /api/showroom/lead-distribution — current entries + available
// PUT  /api/showroom/lead-distribution — upsert entries
// Owner / manager only. Tenant-scoped via the caller's showroom_id.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import { SHOWROOM_EMPLOYEE_ROLES, ROLE_LABEL_FR, type ShowroomEmployeeRole } from '@/lib/employee-helpers'

export const runtime = 'nodejs'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type EmployeeLite = {
  user_id:    string
  email:      string | null
  full_name:  string | null
  role:       ShowroomEmployeeRole
}

async function loadTeam(admin: ReturnType<typeof adminClient>, showroomId: string): Promise<EmployeeLite[]> {
  const { data: roles, error } = await admin
    .from('user_roles')
    .select('user_id, role')
    .eq('showroom_id', showroomId)
    .in('role', SHOWROOM_EMPLOYEE_ROLES)
  if (error) throw new ApiError(500, error.message)
  const wanted = new Set((roles ?? []).map((r) => r.user_id as string))
  const byId   = new Map<string, { email: string | null; full_name: string | null }>()
  for (let page = 1; page <= 10 && byId.size < wanted.size; page++) {
    const { data, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (lErr) throw new ApiError(500, lErr.message)
    for (const u of data.users) {
      if (!wanted.has(u.id)) continue
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      byId.set(u.id, {
        email:     u.email ?? null,
        full_name: typeof meta.full_name === 'string' ? meta.full_name : null,
      })
    }
    if (data.users.length < 200) break
  }
  return (roles ?? []).map((r) => ({
    user_id:   r.user_id as string,
    email:     byId.get(r.user_id as string)?.email ?? null,
    full_name: byId.get(r.user_id as string)?.full_name ?? null,
    role:      r.role as ShowroomEmployeeRole,
  }))
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')

    const admin = adminClient()

    const [distRes, team] = await Promise.all([
      admin
        .from('showroom_lead_distribution')
        .select('user_id, active, last_assigned_at, created_at, updated_at')
        .eq('showroom_id', ctx.showroomId)
        .order('created_at', { ascending: true }),
      loadTeam(admin, ctx.showroomId),
    ])
    if (distRes.error) throw new ApiError(500, distRes.error.message)
    const dist = (distRes.data ?? []) as Array<{
      user_id: string; active: boolean; last_assigned_at: string | null;
      created_at: string; updated_at: string
    }>

    const teamById = new Map(team.map((t) => [t.user_id, t]))
    const entries = dist.map((d) => {
      const t = teamById.get(d.user_id)
      return {
        user_id:          d.user_id,
        email:            t?.email ?? null,
        full_name:        t?.full_name ?? null,
        role:             t?.role ?? null,
        role_label:       t?.role ? ROLE_LABEL_FR[t.role] : null,
        active:           !!d.active,
        last_assigned_at: d.last_assigned_at,
      }
    })

    const inRotation = new Set(dist.map((d) => d.user_id))
    const available = team
      .filter((t) => !inRotation.has(t.user_id))
      .map((t) => ({
        user_id:    t.user_id,
        email:      t.email,
        full_name:  t.full_name,
        role:       t.role,
        role_label: ROLE_LABEL_FR[t.role],
      }))

    return NextResponse.json({ entries, available })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')

    const body = await req.json().catch(() => ({}))
    const raw  = Array.isArray(body.entries) ? body.entries : []
    type Row = { user_id: string; active: boolean }
    const wanted: Row[] = raw
      .map((r: unknown) => {
        if (!r || typeof r !== 'object') return null
        const uid = (r as { user_id?: unknown }).user_id
        const act = (r as { active?:  unknown }).active
        if (typeof uid !== 'string' || !uid) return null
        return { user_id: uid, active: act !== false }
      })
      .filter((x: Row | null): x is Row => !!x)

    const admin = adminClient()

    // Sanity: every user_id must be an actual employee of this showroom.
    if (wanted.length > 0) {
      const ids = wanted.map((w) => w.user_id)
      const { data: valid, error: vErr } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('showroom_id', ctx.showroomId)
        .in('role', SHOWROOM_EMPLOYEE_ROLES)
        .in('user_id', ids)
      if (vErr) throw new ApiError(500, vErr.message)
      const okIds = new Set((valid ?? []).map((r) => r.user_id as string))
      for (const w of wanted) {
        if (!okIds.has(w.user_id)) {
          throw new ApiError(400, "L'un des utilisateurs n'appartient pas à votre showroom.")
        }
      }
    }

    // Upsert each entry (preserves last_assigned_at).
    if (wanted.length > 0) {
      const { error: upErr } = await admin
        .from('showroom_lead_distribution')
        .upsert(
          wanted.map((w) => ({
            showroom_id: ctx.showroomId,
            user_id:     w.user_id,
            active:      w.active,
          })),
          { onConflict: 'showroom_id,user_id' },
        )
      if (upErr) throw new ApiError(400, upErr.message)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
