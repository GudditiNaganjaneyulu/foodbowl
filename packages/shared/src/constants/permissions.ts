import { ROLES, type RoleKey } from './roles';

/**
 * Canonical permission keys. The DB (Permission table) is seeded from this
 * list — add here first, then re-run the seed, never hardcode a permission
 * string anywhere else.
 */
export const PERMISSIONS = {
  MENU_MANAGE: 'menu.manage',
  ORDERS_VIEW: 'orders.view',
  ORDERS_MANAGE: 'orders.manage',
  DELIVERY_ASSIGN: 'delivery.assign',
  DELIVERY_FULFILL: 'delivery.fulfill', // update own assigned delivery leg
  REPORTS_VIEW: 'reports.view',
  RESTAURANT_MANAGE: 'restaurant.manage',
  USERS_MANAGE: 'users.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Default permission grants per role. `staff` gets a conservative baseline;
 * the owner can grant/revoke individual permissions per staff member via the
 * Users screen (UserPermission overrides) — this table is only the default.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  [ROLES.CUSTOMER]: [],
  [ROLES.RESTAURANT_OWNER]: ALL_PERMISSIONS,
  [ROLES.DELIVERY_PARTNER]: [PERMISSIONS.DELIVERY_FULFILL],
  [ROLES.STAFF]: [PERMISSIONS.ORDERS_VIEW],
};

/** Permissions that may never be granted to a `staff` user, even as an override. */
export const OWNER_ONLY_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.RESTAURANT_MANAGE,
];
