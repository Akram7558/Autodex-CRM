// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/vehicules — fleet management.
// ─────────────────────────────────────────────────────────────────────
// Server component: derives the caller's role + active plan_type from
// supabase, redirects Closer / Prospecteur back to the hub (Closer
// gets read-only inventory in Phase 2), and renders the client page.
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import RentalVehiclesPage, { type PlanType } from '@/components/rental/RentalVehiclesPage'

export default async function Page() {
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    // Env missing — middleware should have caught it earlier. Default
    // to Classique without edit permissions.
    return <RentalVehiclesPage planType="classique" canEdit={false} />
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }))
      },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/location/vehicules')

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role, showroom_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const role = (roleRow?.role as string | undefined) ?? null

  if (role !== 'owner' && role !== 'manager' && role !== 'super_admin') {
    redirect('/dashboard/location')
  }

  // Resolve the active plan_type via showrooms.plan_id → saas_plans.
  let planType: PlanType = 'classique'
  if (roleRow?.showroom_id) {
    const { data: showroom } = await supabase
      .from('showrooms')
      .select('plan_id, saas_plans(plan_type)')
      .eq('id', roleRow.showroom_id)
      .maybeSingle()
    type PlanRow = { saas_plans?: { plan_type?: string } | null } | null
    const pt = (showroom as PlanRow)?.saas_plans?.plan_type
    if (pt === 'totale') planType = 'totale'
  }

  // Owner + Manager edit; super_admin treated as owner here for parity.
  const canEdit = role === 'owner' || role === 'manager' || role === 'super_admin'

  return <RentalVehiclesPage planType={planType} canEdit={canEdit} />
}
