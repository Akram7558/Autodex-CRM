// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/contrats — rental contracts list (thin shell).
// ─────────────────────────────────────────────────────────────────────
// PILOT: converted to the sales client-fetch pattern (mirrors how
// clients/page.tsx delegates entirely to its client View). This route is
// now a thin shell that renders the self-fetching <RentalContractsList />
// with NO server-side data fetch and NO getServerAuth — so the route
// transition commits INSTANTLY instead of blocking on server query
// latency. RentalContractsList resolves role/showroom client-side
// (getCurrentUserRole) and fetches via the supabase browser client behind
// an internal skeleton, exactly like VentesView / the other sales Views.
//
// Access stays enforced by middleware (ROUTE_ACL gates /dashboard/location
// → owner/manager/closer/super_admin and bounces logged-out users before
// this page loads) AND by RLS, which row-scopes every query the browser
// client runs (showroom isolation; closer → own rentals). getServerAuth is
// intentionally no longer imported here — it remains in use by other pages.
// ─────────────────────────────────────────────────────────────────────

import RentalContractsList from '@/components/rental/RentalContractsList'

export default function Page() {
  return <RentalContractsList />
}
