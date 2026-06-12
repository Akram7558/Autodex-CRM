// Sales activity feed guard — blocks showrooms without module_vente. Covers
// /dashboard/activites + subroutes. The feed reads the sales `activities`
// table (joined to leads), so it's empty/confusing on a location-only
// showroom. super_admin / SaaS / no-showroom BYPASS. Additive module gating
// only; role gating stays in middleware. (When a rental-activities view
// exists, revisit to make this module-aware.)

import type { ReactNode } from 'react'
import { requireModule } from '@/lib/server-auth'

export default async function ActivitesLayout({ children }: { children: ReactNode }) {
  await requireModule('vente')
  return <>{children}</>
}
