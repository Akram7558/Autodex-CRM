// ─────────────────────────────────────────────────────────────────────
// GET /api/employees
// ─────────────────────────────────────────────────────────────────────
// Owner / manager only. Lists every teammate (manager / closer /
// prospecteur) under the caller's showroom. Hydrates email + full_name
// + phone from the auth users table via admin.listUsers (same pattern
// as the internal-users route).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import { SHOWROOM_EMPLOYEE_ROLES } from '@/lib/employee-helpers'

export const runtime = 'nodejs'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }

    const admin = adminClient()

    // 1. Pull role rows scoped to the caller's showroom.
    let q = admin
      .from('user_roles')
      .select('id, user_id, role, showroom_id, created_by, created_at')
      .in('role', SHOWROOM_EMPLOYEE_ROLES)
      .order('created_at', { ascending: false })
    if (ctx.showroomId) q = q.eq('showroom_id', ctx.showroomId)

    const { data: roleRows, error: roleErr } = await q
    if (roleErr) throw new ApiError(500, roleErr.message)
    if (!roleRows || roleRows.length === 0) {
      return NextResponse.json({ employees: [] })
    }

    // 2. Hydrate emails + metadata from auth.users (paginated, capped).
    const wanted = new Set(roleRows.map(r => r.user_id as string))
    const authById = new Map<string, { email: string | null; full_name: string | null; phone: string | null }>()
    for (let page = 1; page <= 10 && authById.size < wanted.size; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw new ApiError(500, error.message)
      for (const u of data.users) {
        if (!wanted.has(u.id)) continue
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        authById.set(u.id, {
          email:     u.email ?? null,
          full_name: typeof meta.full_name === 'string' ? meta.full_name : null,
          phone:     typeof meta.phone === 'string' ? meta.phone : null,
        })
      }
      if (data.users.length < 200) break
    }

    const employees = roleRows.map(r => {
      const a = authById.get(r.user_id as string)
      return {
        id:          r.id,
        user_id:     r.user_id,
        email:       a?.email ?? null,
        full_name:   a?.full_name ?? null,
        phone:       a?.phone ?? null,
        role:        r.role as 'manager' | 'closer' | 'prospecteur',
        created_by:  r.created_by as string | null,
        created_at:  r.created_at as string,
      }
    })

    return NextResponse.json({ employees })
  } catch (err) {
    return errorResponse(err)
  }
}
