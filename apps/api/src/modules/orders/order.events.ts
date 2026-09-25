import { REALTIME, type OrderDTO, type OrderStatus } from '@foodbowl/shared';
import { emitToRooms } from '../../lib/realtime';
import { logger } from '../../lib/logger';
import { notifyOrderPlaced, notifyOrderTransition } from '../notifications/notification.events';

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
  } catch (err) {
    logger.warn({ err, orderId: order.id }, 'failed to publish order update event');
  }
}
