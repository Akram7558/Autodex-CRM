// ─────────────────────────────────────────────────────────────────────
// getServerAuth — cached per-request auth resolver for /dashboard pages.
// ─────────────────────────────────────────────────────────────────────
// ⚠️  SECURITY — READ THIS BEFORE USING THIS HELPER ANYWHERE  ⚠️
//
//   Identity here is derived with `supabase.auth.getSession()`, which
//   decodes the Supabase auth cookie LOCALLY and does NOT call the Auth
//   server to validate the JWT. That is what makes it fast (it skips the
//   ~120-300ms getUser() network round-trip), but it is ONLY trustworthy
//   because the AutoDex middleware (src/middleware.ts, matcher
//   `['/dashboard/:path*']`) has ALREADY run `supabase.auth.getUser()` — a
//   network-validated check — on this exact request before the server
//   component renders. A forged or tampered cookie is rejected by the
//   middleware long before execution reaches here.
//
//   THEREFORE, the rules are non-negotiable:
//
//   • Use this EXCLUSIVELY in server components rendered under /dashboard
//     (paths the middleware matcher covers). Middleware is the one network
//     checkpoint the whole scheme leans on.
//
//   • NEVER use this in /api/*. API routes are UNMATCHED by the middleware
//     (it runs on `/dashboard/:path*` only), so they have NO pre-validation.
//     They MUST keep authenticating themselves with requireUser /
//     requireShowroomMember from `src/lib/api-auth.ts`, which call
//     getUser() (network) on every request. Importing getServerAuth into an
//     API route would be an auth-bypass hole.
//
//   • Do NOT "optimize" middleware.ts or api-auth.ts to rely on this helper.
//     Their getUser() calls are deliberate and must stay.
//
//   `import 'server-only'` makes the build fail loudly if this module is
//   ever pulled into a client bundle. `cache()` collapses repeated calls
//   within a single server render to one resolution (and is request-scoped
//   by Next.js, so sessions never leak across concurrent requests).
// ─────────────────────────────────────────────────────────────────────

import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import type { AppRole } from '@/lib/types'

export type ServerAuth = {
  userId:       string
  /** null only in the anomalous "authenticated but unprovisioned" case. */
  role:         AppRole | null
  /** user_roles.showroom_id — null for super_admin (global) or unprovisioned. */
  showroomId:   string | null
  isSuperAdmin: boolean
}

/**
 * Resolve the signed-in user's id + role + showroom for a /dashboard server
 * render. See the security banner above: getSession() is safe here ONLY
 * because middleware already getUser()-validated the same request.
 *
 * Behaviour:
 *  - Identity from getSession() (local cookie decode, no network).
 *  - DEFENSIVE FALLBACK: if no session is present (anomalous behind the
 *    middleware gate), pays for ONE getUser() (network) before giving up —
 *    never silently proceeds unauthenticated.
 *  - If there is still no user, redirects to /login (mirrors the pages'
 *    prior `if (!user) redirect('/login…')` behaviour).
 *  - Then reads role + showroom_id from user_roles — the same single query
 *    the pages used to inline. A missing role row yields role=null and is
 *    left to each page's own role gating (unchanged), exactly as before.
 */
export const getServerAuth = cache(async (): Promise<ServerAuth> => {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }))
        },
        // Read-only: a server component can't persist a refreshed cookie.
        setAll() {},
      },
    },
  )

  // Identity via LOCAL cookie decode — no network. Trustworthy here only
  // because middleware already getUser()-validated this /dashboard request.
  const { data: { session } } = await supabase.auth.getSession()
  let userId = session?.user?.id ?? null

  // Defensive fallback — pay for ONE network getUser() if the session is
  // somehow absent. Never proceed unauthenticated.
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  }

  // Still nothing → bounce to login, mirroring the pages' old behaviour.
  if (!userId) redirect('/login')

  // Authorization data (role + tenant) — the same query pages used to inline.
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role, showroom_id')
    .eq('user_id', userId)
    .maybeSingle()

  const role = (roleRow?.role as AppRole | undefined) ?? null
  return {
    userId,
    role,
    showroomId:   (roleRow?.showroom_id as string | null) ?? null,
    isSuperAdmin: role === 'super_admin',
  }
})
