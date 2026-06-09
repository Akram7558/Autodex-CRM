// ─────────────────────────────────────────────────────────────────────
// Location section guard — blocks showrooms without module_location.
// ─────────────────────────────────────────────────────────────────────
// Covers /dashboard/location and ALL subroutes (prospects, contrats,
// vehicules, clients, tarifs). requireModule redirects a showroom lacking the
// module to its default landing; super_admin / SaaS / no-showroom BYPASS.
// Role gating stays in middleware (ROUTE_ACL) — this is ADDITIVE module
// gating only.
// ─────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { requireModule } from '@/lib/server-auth'

export default async function LocationLayout({ children }: { children: ReactNode }) {
  await requireModule('location')
  return <>{children}</>
}
