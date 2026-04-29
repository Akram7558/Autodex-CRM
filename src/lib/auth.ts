// ─────────────────────────────────────────────────────────────────────
// AutoDex RBAC helpers (multi-tenant SaaS).
// ─────────────────────────────────────────────────────────────────────
// `getCurrentUserRole()` resolves the signed-in user's role + showroom
// from Supabase. The middleware uses it (server-side) to gate routes,
// and client components can use it to decide what UI to render.
// ─────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/lib/types'

export type CurrentUserRole = {
  userId:      string
  email:       string | null
  role:        AppRole
  showroomId:  string | null
} | null

/**
 * Fetch the current user's role and showroom binding.
 * Returns `null` when no user is signed in OR when no row exists in
 * `user_roles` for that user yet (e.g. freshly created accounts that
 * haven't been provisioned).
 */
export async function getCurrentUserRole(): Promise<CurrentUserRole> {
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return null

  const { data, error } = await supabase
    .from('user_roles')
    .select('role, showroom_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    // Table missing or RLS blocking — treat as "no role".
    console.warn('[auth] failed to load user_roles:', error.message)
    return null
  }
  if (!data) return null

  return {
    userId:     user.id,
    email:      user.email ?? null,
    role:       data.role as AppRole,
    showroomId: (data.showroom_id as string | null) ?? null,
  }
}

/**
 * Default landing dashboard for a given role. Used by the middleware to
 * route users to the right UI after login and to redirect away from
 * pages they're not allowed to see.
 */
export function defaultDashboardForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin': return '/dashboard/super-admin'
    case 'owner':       return '/dashboard'
    case 'manager':     return '/dashboard'
    case 'closer':      return '/dashboard/rendez-vous'
    case 'prospecteur': return '/dashboard/leads'
  }
}

/**
 * Route ACL: which roles are allowed to enter a given dashboard URL.
 * The middleware consults this when an authenticated user requests a
 * page under /dashboard. If the role isn't in the list, we redirect
 * them to their default dashboard.
 *
 * Order matters — the first matching prefix wins.
 */
const ROUTE_ACL: Array<{ prefix: string; allow: AppRole[] }> = [
  // Super-admin only — global tenant management.
  { prefix: '/dashboard/super-admin', allow: ['super_admin'] },

  // Owner / manager surfaces.
  { prefix: '/dashboard/parametres',             allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/settings/integrations',  allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/alerts',                 allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/ventes',                 allow: ['super_admin', 'owner', 'manager'] },

  // Day-to-day commercial pages — accessible to everyone with a role.
  { prefix: '/dashboard/rendez-vous', allow: ['super_admin', 'owner', 'manager', 'closer'] },
  { prefix: '/dashboard/vehicules',   allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/activites',   allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/leads',       allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/prospects',   allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },

  // Root dashboard — KPIs / overview.
  { prefix: '/dashboard', allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
]

export function isRoleAllowed(pathname: string, role: AppRole): boolean {
  for (const rule of ROUTE_ACL) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) {
      return rule.allow.includes(role)
    }
  }
  // Unknown route under /dashboard → deny by default.
  return false
}
