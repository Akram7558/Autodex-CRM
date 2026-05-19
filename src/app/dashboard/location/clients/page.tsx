// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/clients — Owner + Manager only (middleware ACL
// enforces the same; this is belt-and-suspenders).
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import RentalCustomersPage from '@/components/rental/RentalCustomersPage'

export default async function Page() {
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
    if (!user) redirect('/login?redirect=/dashboard/location/clients')

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    const role = (roleRow?.role as string | undefined) ?? null
    if (role !== 'owner' && role !== 'manager' && role !== 'super_admin') {
      redirect('/dashboard/location')
    }
  }

  return <RentalCustomersPage />
}
