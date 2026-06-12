// ─────────────────────────────────────────────────────────────────────
// PATCH  /api/employees/:user_id  — owner only (role / email / pass)
// DELETE /api/employees/:user_id  — owner: any; manager: only own
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireShowroomAdmin, errorResponse, ApiError } from '@/lib/api-auth'
import {
  isShowroomEmployeeRole,
  allowedCreatableRolesForCaller,
  moduleEmployeeRoles,
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

type RouteCtx = { params: Promise<{ user_id: string }> }

// ─────────────────────────────────────────────────────────────────────
// DELETE
// Owner   : may delete any teammate in their showroom (except owner / self).
// Manager : may delete only rows where user_roles.created_by = self.
// Service-role purges the user_roles row, removes them from the
// distribution table, and deletes the auth user (hard delete).
// ─────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')

    const { user_id } = await params
    if (!user_id) throw new ApiError(400, 'user_id requis.')
    if (user_id === ctx.user.id) {
      throw new ApiError(400, 'Vous ne pouvez pas supprimer votre propre compte.')
    }

    const admin = adminClient()

    const { data: target, error: tErr } = await admin
      .from('user_roles')
      .select('id, user_id, role, showroom_id, created_by')
      .eq('user_id', user_id)
      .eq('showroom_id', ctx.showroomId)
      .maybeSingle()
    if (tErr) throw new ApiError(500, tErr.message)
    if (!target) throw new ApiError(404, 'Employé introuvable dans votre showroom.')

    if (target.role === 'owner') {
      throw new ApiError(400, 'Le propriétaire du showroom ne peut pas être supprimé.')
    }

    if (ctx.role === 'manager') {
      if (target.created_by !== ctx.user.id) {
        throw new ApiError(403, 'Vous ne pouvez supprimer que les employés que vous avez créés.')
      }
    }

    // Remove role + distribution entry + auth user. We do not have a
    // transaction here, so failures past the first step are best-effort —
    // user_roles is the source of truth, so it goes first.
    const { error: delRoleErr } = await admin
      .from('user_roles')
      .delete()
      .eq('user_id', user_id)
      .eq('showroom_id', ctx.showroomId)
    if (delRoleErr) throw new ApiError(400, delRoleErr.message)

    await admin
      .from('showroom_lead_distribution')
      .delete()
      .eq('user_id', user_id)
      .eq('showroom_id', ctx.showroomId)
      .then(() => {}, () => {})

    await admin.auth.admin.deleteUser(user_id).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─────────────────────────────────────────────────────────────────────
// PATCH — owner only. Optional: role / email / password.
// Managers may not change roles, even on their own creations.
// ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomAdmin(req)
    if (!ctx.showroomId) throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    if (ctx.role !== 'owner' && ctx.role !== 'super_admin') {
      throw new ApiError(403, 'Seul le propriétaire peut modifier un employé.')
    }

    const { user_id } = await params
    if (!user_id) throw new ApiError(400, 'user_id requis.')
    if (user_id === ctx.user.id) {
      throw new ApiError(400, 'Vous ne pouvez pas modifier votre propre compte par ce biais.')
    }

    const body = await req.json().catch(() => ({}))
    const wantRole     = body.role
    const wantEmail    = body.email ? String(body.email).trim().toLowerCase() : undefined
    const wantPassword = typeof body.password === 'string' && body.password.length > 0
      ? String(body.password)
      : undefined

    const admin = adminClient()

    // Confirm the target is in the same showroom.
    const { data: target, error: tErr } = await admin
      .from('user_roles')
      .select('user_id, role, showroom_id')
      .eq('user_id', user_id)
      .eq('showroom_id', ctx.showroomId)
      .maybeSingle()
    if (tErr) throw new ApiError(500, tErr.message)
    if (!target) throw new ApiError(404, 'Employé introuvable dans votre showroom.')
    if (target.role === 'owner') {
      throw new ApiError(400, 'Le propriétaire ne peut pas être modifié ici.')
    }

    // Role change (owner-set roles only).
    if (wantRole !== undefined) {
      const allowed = allowedCreatableRolesForCaller(ctx.role)
      if (!isShowroomEmployeeRole(wantRole) || !allowed.includes(wantRole)) {
        throw new ApiError(400, 'Rôle invalide.')
      }

      // Module gate (étape B): the NEW role must be appropriate for the
      // showroom's plan — a LOCATION-ONLY showroom can't take a prospecteur
      // (no rental RLS access). super_admin / no-showroom → no restriction.
      if (!ctx.isSuperAdmin && ctx.showroomId) {
        const { data: sr } = await ctx.authSb
          .from('showrooms')
          .select('module_vente, module_location')
          .eq('id', ctx.showroomId)
          .maybeSingle()
        const modules = {
          vente:    (sr as { module_vente?: boolean } | null)?.module_vente !== false,
          location: (sr as { module_location?: boolean } | null)?.module_location !== false,
        }
        if (!moduleEmployeeRoles(modules).includes(wantRole)) {
          throw new ApiError(400, "Ce rôle n'est pas disponible pour le plan de ce showroom.")
        }
      }

      if (wantRole !== target.role) {
        const { error: roleErr } = await admin
          .from('user_roles')
          .update({ role: wantRole })
          .eq('user_id', user_id)
          .eq('showroom_id', ctx.showroomId)
        if (roleErr) throw new ApiError(400, roleErr.message)
      }
    }

    // Email + password via auth.admin (best-effort merge into a single call).
    if (wantEmail || wantPassword) {
      const payload: { email?: string; password?: string } = {}
      if (wantEmail)    payload.email    = wantEmail
      if (wantPassword) payload.password = wantPassword
      const { error: authErr } = await admin.auth.admin.updateUserById(user_id, payload)
      if (authErr) throw new ApiError(400, authErr.message)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
