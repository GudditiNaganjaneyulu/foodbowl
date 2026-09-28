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
  /** The current delivery assignment's status, if any — see ACTIVELY_ASSIGNED below. */
  assignmentStatus?: string | null;
}

export type Decision = { allowed: true } | { allowed: false; statusCode: 400 | 403 | 409; message: string };

/** A customer may cancel their own order only before the kitchen starts on it. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = CUSTOMER_CANCELLABLE_STATUSES;

const DELIVERY_LEG: readonly OrderStatus[] = [ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED];

/**
 * A rider genuinely holds this order — as opposed to merely having been
 * `OFFERED` it (still up for grabs: re-offerable per delivery.service, and
 * safe to cancel or self-deliver over) or `REJECTED`/`DELIVERED`. Once
 * ACCEPTED or PICKED_UP, cancelling or self-delivering out from under them
 * would strand a rider mid-errand, so both are blocked below.
 */
export const ACTIVELY_ASSIGNED: readonly string[] = ['ACCEPTED', 'PICKED_UP'];

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
    // Restaurant side: the owner, or staff with orders.manage — but not once
    // a rider actively holds it (accepted or picked up): reject their
    // assignment first, same rule as reassigning (see delivery.service).
    if (actor.role === ROLES.RESTAURANT_OWNER || actor.permissions.has(PERMISSIONS.ORDERS_MANAGE)) {
      if (order.assignmentStatus && ACTIVELY_ASSIGNED.includes(order.assignmentStatus)) {
        return {
          allowed: false,
          statusCode: 409,
          message: 'A delivery partner already has this order — reject their assignment first if it needs to be cancelled',
        };
      }
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
    // The delivery leg belongs to the assigned rider, the owner (override), or
    // staff who can assign deliveries — the latter is what lets a restaurant
    // deliver an order itself when no partner is available (see
    // delivery.service.selfDeliver, the only other caller that reaches here
    // with `to` in DELIVERY_LEG).
    if (isAssignedPartner || actor.role === ROLES.RESTAURANT_OWNER || actor.permissions.has(PERMISSIONS.DELIVERY_ASSIGN)) {
      return { allowed: true };
    }
    return { allowed: false, statusCode: 403, message: 'Only the assigned delivery partner can update this delivery' };
  }

  if (hasRequiredPermission || hasRequiredRole) return { allowed: true };
  const missing = requirement.permissions?.[0] ?? 'the required role';
  return { allowed: false, statusCode: 403, message: `Missing permission: ${missing}` };
}
