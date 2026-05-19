// ─────────────────────────────────────────────────────────────────────
// /login — premium glass redesign.
// ─────────────────────────────────────────────────────────────────────
// Server component shell: redirects already-authenticated visitors to
// their default dashboard before any HTML is sent (mirrors the same
// guard used on the public landing at /). Falls back to rendering the
// client-side <LoginCard /> when env vars are missing.
//
// All form state + supabase.auth.signInWithPassword logic lives inside
// LoginCard (preserved 1:1 from the previous client page).
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { LocaleProvider } from '@/components/landing/LocaleProvider'
import LoginCard from '@/components/auth/LoginCard'

function defaultDashboardForRole(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':      return '/dashboard/super-admin'
    case 'commercial':       return '/dashboard/super-admin'
    case 'prospecteur_saas': return '/dashboard/super-admin/prospects'
    case 'closer':           return '/dashboard/rendez-vous'
    case 'prospecteur':      return '/dashboard/leads'
    case 'owner':
    case 'manager':
    default:                 return '/dashboard'
  }
}

export default async function LoginPage() {
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If env vars exist, transparently bounce authenticated visitors —
  // mirrors the behaviour at /. With env missing we just render the
  // login card so the page is never broken.
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
      if (roleRow) {
        redirect(defaultDashboardForRole(roleRow.role as string | null))
      }
      // No role provisioned — let them see the login (so they can
      // re-authenticate as a different user) without ping-ponging.
    }
  }

  return (
    <LocaleProvider>
      <LoginCard />
    </LocaleProvider>
  )
}
