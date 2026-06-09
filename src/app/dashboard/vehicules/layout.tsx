// Sales inventory guard — blocks showrooms without module_vente. Covers
// /dashboard/vehicules + subroutes. super_admin / SaaS / no-showroom BYPASS.
// Additive module gating only; role gating stays in middleware.

import type { ReactNode } from 'react'
import { requireModule } from '@/lib/server-auth'

export default async function VehiculesLayout({ children }: { children: ReactNode }) {
  await requireModule('vente')
  return <>{children}</>
}
