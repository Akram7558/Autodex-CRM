// ─────────────────────────────────────────────────────────────────────
// AutoDex RBAC middleware.
// ─────────────────────────────────────────────────────────────────────
// Runs on every /dashboard/* request. Resolves the signed-in user, looks
// up their role + showroom in Supabase, and:
//   1. Sends unauthenticated visitors to /
//   2. Redirects users without a provisioned role to /
//   3. Redirects users hitting a route they don't have access to back to
//      their default dashboard for that role
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import type { AppRole } from '@/lib/types'

// ── Inline ACL (mirrors src/lib/auth.ts) ─────────────────────────────
// We duplicate the ACL here because the middleware runs on the Edge
// runtime and importing the supabase client module pulls extra deps.
const ROUTE_ACL: Array<{ prefix: string; allow: AppRole[] }> = [
  { prefix: '/dashboard/super-admin',           allow: ['super_admin'] },
  { prefix: '/dashboard/parametres',            allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/settings/integrations', allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/alerts',                allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/ventes',                allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/rendez-vous',           allow: ['super_admin', 'owner', 'manager', 'closer'] },
  { prefix: '/dashboard/vehicules',             allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/activites',             allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/leads',                 allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/prospects',             allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard',                       allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
]

function isRoleAllowed(pathname: string, role: AppRole): boolean {
  for (const rule of ROUTE_ACL) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) {
      return rule.allow.includes(role)
    }
  }
  return false
}

function defaultDashboardForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin': return '/dashboard/super-admin'
    case 'owner':       return '/dashboard'
    case 'manager':     return '/dashboard'
    case 'closer':      return '/dashboard/rendez-vous'
    case 'prospecteur': return '/dashboard/leads'
  }
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname

  // Only gate /dashboard/*. Everything else (/, /privacy, /terms, /api) flows through.
  if (!pathname.startsWith('/dashboard')) return res

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll().map(({ name, value }) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set({ name, value, ...options })
          }
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Not signed in → bounce to landing.
  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // 2. Look up the role.
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  // No role provisioned → also bounce to landing. The owner/super_admin
  // is responsible for assigning a role before the user can enter.
  if (!roleRow) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('error', 'no_role')
    return NextResponse.redirect(url)
  }

  const role = roleRow.role as AppRole

  // 3. Route ACL. If the user isn't allowed here, send them to the
  //    default dashboard for their role.
  if (!isRoleAllowed(pathname, role)) {
    const url = req.nextUrl.clone()
    url.pathname = defaultDashboardForRole(role)
    url.search = ''
    return NextResponse.redirect(url)
  }

  return res
}

// Run only on dashboard routes (skip _next, api, static assets).
export const config = {
  matcher: ['/dashboard/:path*'],
}
