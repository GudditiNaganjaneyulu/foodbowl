import {
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_STATUS,
  PERMISSIONS,
  ROLES,
  TRANSITION_REQUIREMENTS,
  canTransition,
  type OrderStatus,
} from '@foodbowl/shared';
import type { Actor } from '../../lib/rbac';

/** Just enough about an order to decide who may see or change it. */
export interface OrderAccess {
  customerId: string;
  assignedPartnerId: string | null;
}

export type Decision = { allowed: true } | { allowed: false; statusCode: 400 | 403 | 409; message: string };

/** A customer may cancel their own order only before the kitchen starts on it. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = CUSTOMER_CANCELLABLE_STATUSES;

const DELIVERY_LEG: readonly OrderStatus[] = [ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED];

export function canViewOrder(actor: Actor, order: OrderAccess): boolean {
  return (
    actor.userId === order.customerId ||
    actor.permissions.has(PERMISSIONS.ORDERS_VIEW) ||
    actor.permissions.has(PERMISSIONS.ORDERS_MANAGE) ||
    actor.userId === order.assignedPartnerId
  );
}

/**
 * The permission half of OrderService.transition() (BUILD_PROMPT.md §4.1):
 * is this move legal from the current state, and may THIS actor make it?
 */
export function authorizeTransition(args: {
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  order: OrderAccess;
}): Decision {
  const { from, to, actor, order } = args;

  if (!canTransition(from, to)) {
    return { allowed: false, statusCode: 409, message: `An order that is ${from} cannot move to ${to}` };
  }
  const requirement = TRANSITION_REQUIREMENTS[to];
  if (!requirement) {
    return { allowed: false, statusCode: 400, message: `Orders cannot be moved to ${to}` };
  }

  const isCustomerOfOrder = actor.userId === order.customerId;
  const isAssignedPartner = actor.userId === order.assignedPartnerId;
  const hasRequiredPermission = requirement.permissions?.some((p) => actor.permissions.has(p)) ?? false;
  const hasRequiredRole = requirement.roles?.includes(actor.role as never) ?? false;

  if (to === ORDER_STATUS.CANCELLED) {
    // Restaurant side: the owner, or staff with orders.manage.
    if (actor.role === ROLES.RESTAURANT_OWNER || actor.permissions.has(PERMISSIONS.ORDERS_MANAGE)) {
      return { allowed: true };
    }
    if (isCustomerOfOrder) {
      return CUSTOMER_CANCELLABLE.includes(from)
        ? { allowed: true }
        : {
            allowed: false,
            statusCode: 403,
            message: 'The kitchen has already started on this order, so it can no longer be cancelled. Please contact the restaurant.',
          };
    }
    return { allowed: false, statusCode: 403, message: 'You cannot cancel this order' };
  }

  if (DELIVERY_LEG.includes(to)) {
    // The delivery leg belongs to the assigned rider (or the owner as an override).
    if (isAssignedPartner || actor.role === ROLES.RESTAURANT_OWNER) return { allowed: true };
    return { allowed: false, statusCode: 403, message: 'Only the assigned delivery partner can update this delivery' };
  }

  if (hasRequiredPermission || hasRequiredRole) return { allowed: true };
  const missing = requirement.permissions?.[0] ?? 'the required role';
  return { allowed: false, statusCode: 403, message: `Missing permission: ${missing}` };
}
