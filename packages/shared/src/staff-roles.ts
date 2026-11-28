import { ROLE_DEFAULT_PERMISSIONS, SYSTEM_ROLE_LABELS } from './permissions-catalog.js';
/** Human staff roles; integration/service identities are deliberately excluded. */
export const STAFF_ROLE_KEYS = ['admin', 'general_manager', 'front_desk', 'reservations', 'housekeeping', 'housekeeping_manager', 'revenue_manager', 'accounting', 'night_auditor', 'readonly'] as const;
export type StaffRoleKey = typeof STAFF_ROLE_KEYS[number];
export const STAFF_ROLES = STAFF_ROLE_KEYS.map(key => ({
  key,
  name: key === 'admin' ? 'Platform administrator' : key === 'general_manager' ? 'Property manager' : SYSTEM_ROLE_LABELS[key],
  permissions: ROLE_DEFAULT_PERMISSIONS[key],
  allProperties: key === 'admin',
}));
export function isStaffRole(value: unknown): value is StaffRoleKey {
  return typeof value === 'string' && (STAFF_ROLE_KEYS as readonly string[]).includes(value);
}
