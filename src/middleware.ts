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
import { createServerClient } from '@supabase/ssr'
import type { AppRole } from '@/lib/types'

// Set to true to enable verbose middleware logging in Vercel runtime logs.
const DEBUG = true

// ── Inline ACL (mirrors src/lib/auth.ts) ─────────────────────────────
// Sub-routes appear BEFORE their parent so longest prefix wins.
const ROUTE_ACL: Array<{ prefix: string; allow: AppRole[] }> = [
  { prefix: '/dashboard/super-admin/utilisateurs', allow: ['super_admin'] },
  { prefix: '/dashboard/super-admin/parametres',   allow: ['super_admin'] },
  { prefix: '/dashboard/super-admin/logs',         allow: ['super_admin'] },
  { prefix: '/dashboard/super-admin/showrooms',    allow: ['super_admin', 'commercial'] },
  { prefix: '/dashboard/super-admin/rendez-vous',  allow: ['super_admin', 'commercial'] },
  { prefix: '/dashboard/super-admin/prospects',    allow: ['super_admin', 'commercial', 'prospecteur_saas'] },
  { prefix: '/dashboard/super-admin',              allow: ['super_admin', 'commercial', 'prospecteur_saas'] },
  { prefix: '/dashboard/parametres',               allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/settings/integrations',    allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/alerts',                   allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/ventes',                   allow: ['super_admin', 'owner', 'manager'] },
  { prefix: '/dashboard/rendez-vous',              allow: ['super_admin', 'owner', 'manager', 'closer'] },
  { prefix: '/dashboard/vehicules',                allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/activites',                allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/leads',                    allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard/prospects',                allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
  { prefix: '/dashboard',                          allow: ['super_admin', 'owner', 'manager', 'closer', 'prospecteur'] },
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
    case 'super_admin':       return '/dashboard/super-admin'
    case 'commercial':        return '/dashboard/super-admin'
    case 'prospecteur_saas':  return '/dashboard/super-admin/prospects'
    case 'owner':             return '/dashboard'
    case 'manager':           return '/dashboard'
    case 'closer':            return '/dashboard/rendez-vous'
    case 'prospecteur':       return '/dashboard/leads'
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
        getAll() {
          return req.cookies.getAll().map(({ name, value }) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          // Mirror cookies onto BOTH the request (so subsequent reads in
          // this middleware see fresh values) and the response (so the
          // browser persists them).
          for (const { name, value, options } of cookiesToSet) {
            req.cookies.set(name, value)
            res.cookies.set({ name, value, ...options })
          }
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (DEBUG) {
    console.log('[mw]', pathname, '· user:', user?.id ?? 'none', '· email:', user?.email ?? 'none')
  }

  // 1. Not signed in → bounce to landing.
  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('redirect', pathname)
    if (DEBUG) console.log('[mw] redirect → / (no session)')
    return NextResponse.redirect(url)
  }

  // 2. Look up the role.
  const { data: roleRow, error: roleErr } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (DEBUG) {
    console.log('[mw] role lookup:', roleRow?.role ?? 'none', '· err:', roleErr?.message ?? 'none')
  }

  // No role provisioned → bounce to landing.
  if (!roleRow) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('error', 'no_role')
    if (DEBUG) console.log('[mw] redirect → / (no role row)')
    return NextResponse.redirect(url)
  }

  const role = roleRow.role as AppRole

  // 3. Route ACL.
  if (!isRoleAllowed(pathname, role)) {
    const target = defaultDashboardForRole(role)
    if (DEBUG) console.log('[mw] redirect →', target, `(role=${role} not allowed at ${pathname})`)
    const url = req.nextUrl.clone()
    url.pathname = target
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (DEBUG) console.log('[mw] allow', pathname, `(role=${role})`)
  return res
}

// Run only on dashboard routes (skip _next, api, static assets).
export const config = {
  matcher: ['/dashboard/:path*'],
}
