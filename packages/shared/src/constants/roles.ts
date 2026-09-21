export const ROLES = {
  CUSTOMER: 'customer',
  RESTAURANT_OWNER: 'restaurant_owner',
  DELIVERY_PARTNER: 'delivery_partner',
  STAFF: 'staff',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleKey[] = Object.values(ROLES);
