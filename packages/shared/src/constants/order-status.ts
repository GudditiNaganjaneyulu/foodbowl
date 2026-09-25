import { PERMISSIONS, type PermissionKey } from './permissions';
import { ROLES, type RoleKey } from './roles';

export const ORDER_STATUS = {
  PLACED: 'PLACED',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const TERMINAL_STATUSES: OrderStatus[] = [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED];

/**
 * Legal forward transitions. `OrderService.transition()` (apps/api) is the
 * only place allowed to consult this — never mutate Order.status elsewhere.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY_FOR_PICKUP, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.READY_FOR_PICKUP]: [ORDER_STATUS.OUT_FOR_DELIVERY],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

/**
 * Which role/permission may perform a given transition. A role listed OR a
 * permission listed is sufficient (checked with OR, not AND).
 */
export const TRANSITION_REQUIREMENTS: Partial<
  Record<OrderStatus, { roles?: RoleKey[]; permissions?: PermissionKey[] }>
> = {
  [ORDER_STATUS.CONFIRMED]: { permissions: [PERMISSIONS.ORDERS_MANAGE] },
  [ORDER_STATUS.PREPARING]: { permissions: [PERMISSIONS.ORDERS_MANAGE] },
  [ORDER_STATUS.READY_FOR_PICKUP]: { permissions: [PERMISSIONS.ORDERS_MANAGE] },
  [ORDER_STATUS.OUT_FOR_DELIVERY]: {
    roles: [ROLES.DELIVERY_PARTNER],
    permissions: [PERMISSIONS.DELIVERY_FULFILL],
  },
  [ORDER_STATUS.DELIVERED]: {
    roles: [ROLES.DELIVERY_PARTNER],
    permissions: [PERMISSIONS.DELIVERY_FULFILL],
  },
  [ORDER_STATUS.CANCELLED]: {
    roles: [ROLES.CUSTOMER, ROLES.RESTAURANT_OWNER],
    permissions: [PERMISSIONS.ORDERS_MANAGE],
  },
};

/** Statuses in which a customer may still cancel their own order (before the kitchen starts). */
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [ORDER_STATUS.PLACED, ORDER_STATUS.CONFIRMED];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'Order placed',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
