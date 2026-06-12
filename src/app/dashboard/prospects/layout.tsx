// Sales pipeline guard — blocks showrooms without module_vente. Covers
// /dashboard/prospects (the sales kanban) + subroutes. super_admin / SaaS /
// no-showroom BYPASS. Additive module gating only; role gating stays in
// middleware. (The page is a Suspense-wrapped client component — a server
// layout around it is fine.)

import type { ReactNode } from 'react'
import { requireModule } from '@/lib/server-auth'

export default async function ProspectsLayout({ children }: { children: ReactNode }) {
  await requireModule('vente')
  return <>{children}</>
}
