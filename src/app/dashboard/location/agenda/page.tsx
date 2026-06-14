// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/agenda — monthly rental calendar (thin shell).
// ─────────────────────────────────────────────────────────────────────
// Same client-fetch pattern as the rest of the Location module (contrats
// pilot 0435d4b, prospects 2c6fec8, hub 1641da8). This route is a thin
// shell that renders the self-fetching <RentalAgendaCalendar /> with NO
// server-side data fetch and NO getServerAuth — the route transition
// commits INSTANTLY; the calendar loads its own data behind an internal
// skeleton (persistent grid shell).
//
// Access is already enforced WITHOUT a guard file here: middleware
// (ROUTE_ACL: /dashboard/location → owner/manager/closer/super_admin)
// gates the role, location/layout.tsx (requireModule('location')) gates the
// module for ALL subroutes, and RLS row-scopes every browser query
// (showroom isolation; closer → own rentals via assigned_to).
// ─────────────────────────────────────────────────────────────────────

import RentalAgendaCalendar from '@/components/rental/RentalAgendaCalendar'

export default function Page() {
  return <RentalAgendaCalendar />
}
