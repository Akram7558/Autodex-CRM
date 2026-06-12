// ─────────────────────────────────────────────────────────────────────
// /dashboard/location — rental hub (thin shell).
// ─────────────────────────────────────────────────────────────────────
// Converted to the sales client-fetch pattern (mirrors the contrats pilot
// 0435d4b and the prospects conversion 2c6fec8). This route is now a thin
// shell that renders the self-fetching <RentalHubView /> with NO server-side
// data fetch and NO getServerAuth — so the route transition commits
// INSTANTLY instead of blocking on auth + agenda + 4 KPI queries.
// RentalHubView resolves role/showroom client-side (getCurrentUserRole) and
// fetches agenda + KPIs via the supabase browser client behind internal
// skeletons (KPI cards + agenda zone).
//
// Access stays enforced by middleware (ROUTE_ACL gates /dashboard/location
// → owner/manager/closer/super_admin), the module guard in
// location/layout.tsx (requireModule('location')), AND by RLS, which
// row-scopes every query the browser client runs (showroom isolation;
// closer → own rentals; revenue visible to owner/manager/super_admin only).
// ─────────────────────────────────────────────────────────────────────

import RentalHubView from '@/components/rental/RentalHubView'

export default function RentalDashboardPage() {
  return <RentalHubView />
}
