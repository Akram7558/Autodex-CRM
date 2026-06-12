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

export type ShowroomModules = { vente: boolean; location: boolean }

/** A showroom that runs ONLY the rental module (no sales). */
export function isLocationOnly(modules: ShowroomModules): boolean {
  return modules.location && !modules.vente
}

/**
 * Module-aware FR label for a showroom employee role. A LOCATION-ONLY showroom
 * relabels manager → "Gérant", closer → "Agent de location"; vente-only and
 * complet keep the standard labels. The stored role VALUE never changes — this
 * is display-only.
 */
export function roleLabel(role: ShowroomEmployeeRole, modules: ShowroomModules): string {
  if (isLocationOnly(modules)) {
    if (role === 'manager') return 'Gérant'
    if (role === 'closer')  return 'Agent de location'
  }
  return ROLE_LABEL_FR[role]
}

/**
 * Employee roles a showroom may use, given its modules. A location-only
 * showroom drops `prospecteur` (it has no rental RLS access). Otherwise the
 * full set.
 */
export function moduleEmployeeRoles(modules: ShowroomModules): ShowroomEmployeeRole[] {
  return isLocationOnly(modules) ? ['manager', 'closer'] : [...SHOWROOM_EMPLOYEE_ROLES]
}

/** Roles to OFFER in the create dropdown: caller-allowed ∩ module-appropriate. */
export function offeredCreatableRoles(caller: AppRole, modules: ShowroomModules): ShowroomEmployeeRole[] {
  const moduleRoles = moduleEmployeeRoles(modules)
  return allowedCreatableRolesForCaller(caller).filter((r) => moduleRoles.includes(r))
}
