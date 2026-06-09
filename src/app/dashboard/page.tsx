// ─────────────────────────────────────────────────────────────────────
// /dashboard (home) — thin server wrapper for the module-aware landing.
// ─────────────────────────────────────────────────────────────────────
// A location-only showroom (module_vente=false && module_location=true) lands
// on its location hub instead of the sales dashboard. super_admin / SaaS /
// no-showroom are unaffected. SAFETY: if BOTH modules are off we do NOT
// redirect (that would loop: moduleLanding → /dashboard → here) — we just
// render the home. The heavy client home lives in ./DashboardHomeView.
// ─────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { getServerAuth } from '@/lib/server-auth'
import DashboardHomeView from './DashboardHomeView'

export default async function Page() {
  const auth = await getServerAuth()
  // Location-only → land on the location hub. Anything else (incl. both-off)
  // renders the home normally.
  if (!auth.isSuperAdmin && auth.showroomId && !auth.moduleVente && auth.moduleLocation) {
    redirect('/dashboard/location')
  }
  return <DashboardHomeView />
}
