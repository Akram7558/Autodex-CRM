// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/clients/[id]
// ─────────────────────────────────────────────────────────────────────
// Server-side: auth + role + showroom check, then RLS-aware fetch of
// the customer row and their rental history. Renders the client
// detail component with the prepared payload.
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import RentalCustomerDetail from '@/components/rental/RentalCustomerDetail'

type Params = { id: string }

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) notFound()

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }))
      },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/dashboard/location/clients/${id}`)

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  const role = (roleRow?.role as string | undefined) ?? null
  if (role !== 'owner' && role !== 'manager' && role !== 'super_admin') {
    redirect('/dashboard/location')
  }

  // RLS scopes the rows to the showroom automatically.
  const { data: customer } = await supabase
    .from('rental_customers')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!customer) notFound()

  const { data: rentals } = await supabase
    .from('rentals')
    .select(`
      id, contract_number, status, start_date, end_date,
      duration_days, total_rental_amount, created_at,
      rental_vehicle:rental_vehicles ( marque, modele, annee, immatriculation )
    `)
    .eq('customer_id', id)
    .order('start_date', { ascending: false })

  const canEdit   = role === 'owner' || role === 'manager' || role === 'super_admin'
  const canDelete = role === 'owner' || role === 'super_admin'

  return (
    <RentalCustomerDetail
      customer={customer}
      rentals={rentals ?? []}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  )
}
