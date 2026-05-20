// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/clients — Owner + Manager + super_admin only.
// ─────────────────────────────────────────────────────────────────────
// Access is enforced by middleware (src/middleware.ts ROUTE_ACL gates
// /dashboard/location/clients) AND by RLS on rental_customers. The page
// itself used to re-run getUser() + a user_roles lookup as
// "belt-and-suspenders", which duplicated the middleware's two Supabase
// round trips on every load and was the bulk of this route's server
// latency. Removed — middleware + RLS are the source of truth, so this
// server component now does zero round trips and renders instantly.
// ─────────────────────────────────────────────────────────────────────

import RentalCustomersPage from '@/components/rental/RentalCustomersPage'

export default function Page() {
  return <RentalCustomersPage />
}
