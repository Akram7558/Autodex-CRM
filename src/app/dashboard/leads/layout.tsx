// Sales leads guard — blocks showrooms without module_vente. Covers
// /dashboard/leads + subroutes. super_admin / SaaS / no-showroom BYPASS.
// Additive module gating only; role gating stays in middleware.

import type { ReactNode } from 'react'
import { requireModule } from '@/lib/server-auth'

export default async function LeadsLayout({ children }: { children: ReactNode }) {
  await requireModule('vente')
  return <>{children}</>
}
