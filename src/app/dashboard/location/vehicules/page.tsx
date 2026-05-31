// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/vehicules — fleet management.
// ─────────────────────────────────────────────────────────────────────
// Server component: derives the caller's role + active plan_type, then
// renders the client fleet page. Access is also enforced by middleware
// (ROUTE_ACL) and RLS; the role check here is cheap belt-and-suspenders
// since role comes back in the same query we need for plan_type anyway.
//
// Perf: the previous version ran THREE sequential Supabase round trips
// (getUser → user_roles → showrooms+saas_plans). The role/showroom/plan
// lookup is now ONE nested PostgREST query (user_roles → showrooms →
// saas_plans), using the FK user_roles.showroom_id → showrooms (defined
// in migration_12_rbac.sql) and showrooms.plan_id → saas_plans.
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { getServerAuth } from '@/lib/server-auth'
import RentalVehiclesPage, { type PlanType } from '@/components/rental/RentalVehiclesPage'

// PostgREST returns to-one embeds as an object, but supabase-js can widen
// them to arrays depending on inference — normalize either shape.
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

type SaasPlanEmbed = { plan_type?: string | null }
type ShowroomEmbed = { saas_plans?: SaasPlanEmbed | SaasPlanEmbed[] | null }

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

  // Auth deduped: identity comes from the cached getServerAuth (getSession-
  // based — middleware already getUser()-validated this request), dropping
  // the redundant getUser() network round-trip. We only need the user id here;
  // role + plan_type still come from the nested query below (unchanged).
  const tAuth = performance.now()
  const { userId } = await getServerAuth()
  console.log(`[perf] rental:vehicules:auth ${(performance.now() - tAuth).toFixed(0)}ms`)

  // Single nested query: role + showroom + plan_type in one round trip
  // (previously user_roles then a separate showrooms+saas_plans query).
  const tQuery = performance.now()
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role, showroom_id, showrooms(saas_plans(plan_type))')
    .eq('user_id', userId)
    .maybeSingle()
  console.log(`[perf] rental:vehicules:role+plan-query ${(performance.now() - tQuery).toFixed(0)}ms`)

  const role = (roleRow?.role as string | undefined) ?? null
  if (role !== 'owner' && role !== 'manager' && role !== 'super_admin') {
    redirect('/dashboard/location')
  }

  // Resolve plan_type from the nested embed, defaulting to Classique.
  const showroom = firstOf(
    (roleRow as { showrooms?: ShowroomEmbed | ShowroomEmbed[] | null } | null)?.showrooms,
  )
  const saasPlan = firstOf(showroom?.saas_plans)
  const planType: PlanType = saasPlan?.plan_type === 'totale' ? 'totale' : 'classique'

  // Owner + Manager edit; super_admin treated as owner here for parity.
  const canEdit = role === 'owner' || role === 'manager' || role === 'super_admin'

  return <RentalVehiclesPage planType={planType} canEdit={canEdit} />
}
