// ─────────────────────────────────────────────────────────────────────
// Public landing page at `/`
// ─────────────────────────────────────────────────────────────────────
// Server component for SEO metadata + server-side auth check.
// Authenticated visitors get redirected here BEFORE any HTML is sent,
// so unauthenticated visitors never see a flash.
//
// `cookies()` access marks this route as dynamic, which is what we
// want — the redirect decision must reflect the visitor's current
// auth state, not a build-time snapshot.
// ─────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import Landing from '@/components/landing/Landing'

export const metadata: Metadata = {
  title: 'AutoDex — Le CRM des concessionnaires algériens',
  description:
    'Gérez vos prospects, RDV et inventaire depuis une seule plateforme. Essai gratuit 20 jours.',
  openGraph: {
    title: 'AutoDex — CRM pour concessionnaires algériens',
    description:
      'Gérez vos prospects, RDV et inventaire depuis une seule plateforme.',
    url: 'https://www.autodex.store',
    siteName: 'AutoDex',
    locale: 'fr_DZ',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutoDex',
    description: 'Le CRM des concessionnaires algériens',
  },
}

// Mirror the role → dashboard map used by /login and the middleware.
function defaultDashboardForRole(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':       return '/dashboard/super-admin'
    case 'commercial':        return '/dashboard/super-admin'
    case 'prospecteur_saas':  return '/dashboard/super-admin/prospects'
    case 'closer':            return '/dashboard/rendez-vous'
    case 'prospecteur':       return '/dashboard/leads'
    case 'owner':
    case 'manager':
    default:                  return '/dashboard'
  }
}

export default async function HomePage() {
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If env vars aren't configured, just render the public landing —
  // we have no way to check auth without them.
  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }))
        },
        // No-op — we only read. setAll lives on the response side; in
        // a server component we can't mutate cookies anyway.
        setAll() {},
      },
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Resolve the role to pick the right dashboard. If the role row
      // is missing the user has no provisioned access — bounce them
      // to /login so they see the "no role" path instead of a 404
      // dashboard route.
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!roleRow) {
        redirect('/login?error=no_role')
      }
      redirect(defaultDashboardForRole(roleRow.role as string | null))
    }
  }

  // Unauthenticated → render the public landing.
  return <Landing />
}
