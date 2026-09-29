import { REALTIME, type CouponDTO, type OrderDTO, type OrderStatus } from '@foodbowl/shared';
import { emitToRooms } from '../../lib/realtime';
import { invalidate } from '../../lib/cache';
import { PARTNERS_CACHE_KEY, REPORTS_CACHE_KEY } from '../../lib/cache-keys';
import { logger } from '../../lib/logger';
import { notifyCouponIssued, notifyOrderPlaced, notifyOrderTransition } from '../notifications/notification.events';

/**
 * Everything that should happen AFTER an order change has been committed:
 * live pushes to whoever is watching. Kept in one place so adding another
 * side effect (notifications, webhooks) is a single edit here rather than a
 * hunt through the service. Never throws — the change is already saved.
 */
export function orderRooms(order: Pick<OrderDTO, 'id' | 'customer' | 'delivery'>): string[] {
  return [
    REALTIME.rooms.order(order.id),
    REALTIME.rooms.queue,
    REALTIME.rooms.user(order.customer.id),
    ...(order.delivery ? [REALTIME.rooms.user(order.delivery.deliveryPartner.id)] : []),
  ];
}

export function publishOrderPlaced(order: OrderDTO) {
  try {
    emitToRooms(orderRooms(order), REALTIME.EVENTS.ORDER_PLACED, order);
    notifyOrderPlaced(order);
    // A new order changes today's count on the owner's dashboard.
    void invalidate(REPORTS_CACHE_KEY);
  } catch (err) {
    logger.warn({ err, orderId: order.id }, 'failed to publish order placed event');
  }
}

/** `transition` is set for status changes (not for e.g. a delivery offer), and drives notifications. */
export function publishOrderUpdated(
  order: OrderDTO,
  transition?: { from: OrderStatus; to: OrderStatus; actorId: string },
) {
  try {
    emitToRooms(orderRooms(order), REALTIME.EVENTS.ORDER_UPDATED, order);
    if (transition) notifyOrderTransition(order, transition.from, transition.to, transition.actorId);
    // Every status change (kitchen progress, delivery offer/accept/reject/
    // pickup/delivered/self-deliver, cancellation) can move the reports
    // numbers, the delivery-partner workload count, or both — cheaper to
    // invalidate both unconditionally here than to track which call sites
    // actually need which one.
    void invalidate(REPORTS_CACHE_KEY, PARTNERS_CACHE_KEY);
  } catch (err) {
    logger.warn({ err, orderId: order.id }, 'failed to publish order update event');
  }
}

/** A compensation coupon was issued alongside a cancellation — tell the customer (see order.service.cancelOrder). */
export function publishCouponIssued(order: OrderDTO, coupon: CouponDTO) {
  try {
    notifyCouponIssued(order, coupon);
  } catch (err) {
    logger.warn({ err, orderId: order.id }, 'failed to publish coupon issued event');
  }
}
