// ─────────────────────────────────────────────────────────────────────
// Public /register page
// ─────────────────────────────────────────────────────────────────────
// Server component: SEO metadata + server-side auth check (signed-in
// visitors are redirected to their dashboard before any HTML is sent,
// matching the / homepage behaviour). Renders the client `<Register />`
// form for unauthenticated visitors.
// ─────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import Register from '@/components/landing/Register'

export const metadata: Metadata = {
  title: 'AutoDex — Démarrer votre essai gratuit',
  description:
    "Créez votre essai gratuit de 20 jours sur AutoDex. Sans carte bancaire — démarrage en 24 h.",
  openGraph: {
    title: 'AutoDex — Démarrer votre essai gratuit',
    description: "Essai gratuit de 20 jours. Sans carte bancaire.",
    url: 'https://www.autodex.store/register',
    siteName: 'AutoDex',
    locale: 'fr_DZ',
    type: 'website',
  },
}

function defaultDashboardForRole(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':       return '/dashboard/super-admin'
    case 'commercial':        return '/dashboard/super-admin'
    case 'prospecteur_saas':  return '/dashboard/super-admin/prospects'
    case 'closer':            return '/dashboard/rendez-vous'
    case 'prospecteur':       return '/dashboard/leads'
    default:                  return '/dashboard'
  }
}

export default async function RegisterPage() {
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }))
        },
        setAll() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!roleRow) redirect('/login?error=no_role')
      redirect(defaultDashboardForRole(roleRow.role as string | null))
    }
  }

  // Register reads ?plan= via useSearchParams — keep it under a Suspense
  // boundary so the App Router never bails out of rendering this page.
  return (
    <Suspense fallback={null}>
      <Register />
    </Suspense>
  )
}
