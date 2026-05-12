// ─────────────────────────────────────────────────────────────────────
// Shared helpers for /api/employees/* routes.
// ─────────────────────────────────────────────────────────────────────

import type { AppRole } from '@/lib/types'

export const SHOWROOM_EMPLOYEE_ROLES: ('manager' | 'closer' | 'prospecteur')[] = [
  'manager', 'closer', 'prospecteur',
]
export type ShowroomEmployeeRole = (typeof SHOWROOM_EMPLOYEE_ROLES)[number]

export function isShowroomEmployeeRole(r: unknown): r is ShowroomEmployeeRole {
  return r === 'manager' || r === 'closer' || r === 'prospecteur'
}

/** Roles the caller is allowed to provision under their showroom. */
export function allowedCreatableRolesForCaller(caller: AppRole): ShowroomEmployeeRole[] {
  if (caller === 'owner' || caller === 'super_admin') return ['manager', 'closer', 'prospecteur']
  if (caller === 'manager') return ['closer', 'prospecteur']
  return []
}

export const ROLE_LABEL_FR: Record<ShowroomEmployeeRole, string> = {
  manager:     'Manager',
  closer:      'Closer',
  prospecteur: 'Prospecteur',
}
