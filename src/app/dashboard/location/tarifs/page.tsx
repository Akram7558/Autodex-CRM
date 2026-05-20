// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/tarifs — Owner + super_admin only.
// ─────────────────────────────────────────────────────────────────────
// Access is enforced by middleware (src/middleware.ts ROUTE_ACL gates
// /dashboard/location/tarifs to owner/super_admin) AND by RLS on
// rental_settings. The page used to re-run getUser() + a user_roles
// lookup purely as "belt-and-suspenders", duplicating the middleware's
// two Supabase round trips on every load. Removed — middleware + RLS are
// the source of truth, so this server component now does zero round trips.
// ─────────────────────────────────────────────────────────────────────

import RentalSettingsForm from '@/components/rental/RentalSettingsForm'

export default function Page() {
  return <RentalSettingsForm />
}
