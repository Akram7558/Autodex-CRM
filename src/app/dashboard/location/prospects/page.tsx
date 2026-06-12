// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/prospects — rental prospects pipeline (thin shell).
// ─────────────────────────────────────────────────────────────────────
// Converted to the sales client-fetch pattern (mirrors the contrats pilot,
// commit 0435d4b). This route is now a thin shell that renders the
// self-fetching <RentalProspectsList /> with NO server-side data fetch and
// NO getServerAuth — so the route transition commits INSTANTLY instead of
// blocking on server query latency. RentalProspectsList resolves
// role/showroom client-side (getCurrentUserRole) and fetches via the
// supabase browser client behind an internal skeleton, exactly like
// VentesView / RentalContractsList.
//
// Access stays enforced by middleware (ROUTE_ACL gates /dashboard/location
// → owner/manager/closer/super_admin and bounces logged-out users before
// this page loads) AND by RLS, which row-scopes every query the browser
// client runs (showroom isolation). canTrash (owner/manager/super_admin)
// is derived client-side from the same role lookup.
// ─────────────────────────────────────────────────────────────────────

import RentalProspectsList from '@/components/rental/RentalProspectsList'

export default function Page() {
  return <RentalProspectsList />
}
