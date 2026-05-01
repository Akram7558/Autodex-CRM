// ─────────────────────────────────────────────────────────────────────
// Shared auth helpers for service-role API routes.
//
// Routes that use SUPABASE_SERVICE_ROLE_KEY internally bypass RLS, so
// they MUST authenticate the caller themselves. requireUser() reads the
// Supabase auth cookie via @supabase/ssr and resolves the calling user;
// requireShowroomMember() additionally restricts non-super-admin users
// to operations on their own showroom.
//
// On failure these helpers throw an ApiError; route handlers catch it
// with errorResponse() and return a clean JSON error.
//
// Critically, requireShowroomMember() always derives the authoritative
// showroom_id from public.user_roles for tenant users — a client-supplied
// showroom_id is only used as a sanity check, never as the source of
// truth. This kills the entire "pass any showroom_id you want" attack
// surface that previously existed on these routes.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  const msg = err instanceof Error ? err.message : 'Internal error'
  return NextResponse.json({ error: msg }, { status: 500 })
}

function authClient(req: NextRequest): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new ApiError(500, 'Supabase env vars missing')
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map(({ name, value }) => ({ name, value }))
      },
      // No-op — we only ever read inside an API route.
      setAll() {},
    },
  })
}

export type AuthContext = {
  user: User
  /** Anon-keyed client tied to the caller's session — RLS-aware. */
  authSb: SupabaseClient
}

/** Throws 401 if no authenticated user is found in the request cookies. */
export async function requireUser(req: NextRequest): Promise<AuthContext> {
  const authSb = authClient(req)
  const { data: { user }, error } = await authSb.auth.getUser()
  if (error || !user) {
    throw new ApiError(401, 'Non authentifié.')
  }
  return { user, authSb }
}

export type ShowroomContext = AuthContext & {
  role: string
  /**
   * The showroom the caller is acting on. For tenant users this is
   * always equal to their `user_roles.showroom_id`, regardless of any
   * client-supplied showroom_id. For super_admin it is the requested
   * showroom (or null when none is requested, meaning "operate across
   * all showrooms").
   */
  showroomId: string | null
  isSuperAdmin: boolean
}

/**
 * Verifies the caller belongs to the requested showroom. Super admins
 * bypass the membership check and may act on any showroom.
 *
 * Behaviour:
 *  - Throws 401 if no authenticated user.
 *  - Throws 403 if the user has no `user_roles` row.
 *  - Throws 403 if a non-super-admin caller passed a `requestedShowroomId`
 *    that does not match their own.
 *
 * IMPORTANT: callers MUST scope downstream queries with the returned
 * `showroomId`, never with the original request input. For tenants the
 * returned value is always their user_roles.showroom_id.
 */
export async function requireShowroomMember(
  req: NextRequest,
  requestedShowroomId?: string | null,
): Promise<ShowroomContext> {
  const ctx = await requireUser(req)

  const { data: roleRow, error } = await ctx.authSb
    .from('user_roles')
    .select('role, showroom_id')
    .eq('user_id', ctx.user.id)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!roleRow) throw new ApiError(403, 'Aucun rôle attribué.')

  const role = String(roleRow.role)
  const isSuperAdmin = role === 'super_admin'
  const userShowroom: string | null = (roleRow.showroom_id as string | null) ?? null

  if (isSuperAdmin) {
    return {
      ...ctx,
      role,
      showroomId: requestedShowroomId ?? null,
      isSuperAdmin,
    }
  }

  // Tenant: their `user_roles.showroom_id` is the source of truth. If a
  // request param was supplied, it must match — protect against clients
  // trying to talk about a different showroom.
  if (requestedShowroomId && requestedShowroomId !== userShowroom) {
    throw new ApiError(403, 'Accès interdit à ce showroom.')
  }

  return {
    ...ctx,
    role,
    showroomId: userShowroom,
    isSuperAdmin,
  }
}
