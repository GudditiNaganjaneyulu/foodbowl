import { ORDER_STATUS, type OrderDTO, type OrderStatus } from '@foodbowl/shared';
import { notify, restaurantDispatchers, restaurantOrderStaff, type NotificationPayload } from './notification.service';

const money = (v: string) => `$${v}`;

function meta(order: OrderDTO, extra: Record<string, unknown> = {}) {
  return { orderId: order.id, orderNumber: order.orderNumber, status: order.status, ...extra };
}

/** What the customer is told for each status. */
function customerMessage(order: OrderDTO, to: OrderStatus): Pick<NotificationPayload, 'title' | 'body'> | null {
  const n = order.orderNumber;
  switch (to) {
    case ORDER_STATUS.CONFIRMED:
      return { title: `Order ${n} confirmed`, body: 'The restaurant has accepted your order.' };
    case ORDER_STATUS.PREPARING:
      return { title: `Preparing order ${n}`, body: 'The kitchen is cooking your food now.' };
    case ORDER_STATUS.READY_FOR_PICKUP:
      return { title: `Order ${n} is ready`, body: 'Your food is packed and waiting for the delivery partner.' };
    case ORDER_STATUS.OUT_FOR_DELIVERY:
      return {
        title: `Order ${n} is on its way`,
        body: order.delivery
          ? `${order.delivery.deliveryPartner.name} is bringing it to you. Please keep ${money(order.total)} ready.`
          : 'Your order is on its way.',
      };
    case ORDER_STATUS.DELIVERED:
      return { title: `Order ${n} delivered`, body: `Enjoy your meal! We collected ${money(order.total)} in cash.` };
    case ORDER_STATUS.CANCELLED:
      return {
        title: `Order ${n} cancelled`,
        body: order.cancellationReason ? `Reason: ${order.cancellationReason}` : 'Your order was cancelled.',
      };
    default:
      return null;
  }
}

export function notifyOrderPlaced(order: OrderDTO) {
  notify([order.customer.id], {
    type: 'order.placed',
    title: `Order ${order.orderNumber} placed`,
    body: `We've received your order. Total ${money(order.total)}, pay cash on delivery.`,
    metadata: meta(order),
  });
  notify(restaurantOrderStaff(), {
        type: 'order.new',
        title: `New order ${order.orderNumber}`,
        body: `${order.customer.name} · ${order.items.length} item${order.items.length === 1 ? '' : 's'} · ${money(order.total)}`,
        metadata: meta(order),
      });
}

export function notifyOrderTransition(order: OrderDTO, from: OrderStatus, to: OrderStatus, actorId: string) {
  const message = customerMessage(order, to);
  // Don't tell customers about their own action ("you cancelled your order").
  if (message && order.customer.id !== actorId) {
    notify([order.customer.id], { type: 'order.status_changed', ...message, metadata: meta(order, { from, to }) });
  }

  if (to === ORDER_STATUS.CANCELLED) {
    const restaurantBody = `${order.customer.name} cancelled${order.cancellationReason ? `: ${order.cancellationReason}` : ''}`;
    if (order.customer.id === actorId) {
      notify(restaurantOrderStaff(), {
            type: 'order.cancelled',
            title: `Order ${order.orderNumber} cancelled`,
            body: restaurantBody,
            metadata: meta(order, { from, to }),
          });
    }
    if (order.delivery) {
      notify([order.delivery.deliveryPartner.id], {
        type: 'delivery.cancelled',
        title: `Order ${order.orderNumber} cancelled`,
        body: 'This delivery is no longer needed.',
        metadata: meta(order, { from, to }),
      });
    }
  }

  if (to === ORDER_STATUS.READY_FOR_PICKUP && order.delivery && ['OFFERED', 'ACCEPTED'].includes(order.delivery.status)) {
    notify([order.delivery.deliveryPartner.id], {
      type: 'delivery.ready',
      title: `Order ${order.orderNumber} is ready for pickup`,
      body: 'You can collect it from the restaurant now.',
      metadata: meta(order, { from, to }),
    });
  }

  if (to === ORDER_STATUS.DELIVERED) {
    notify(restaurantOrderStaff(), {
          type: 'delivery.completed',
          title: `Order ${order.orderNumber} delivered`,
          body: `${money(order.total)} collected by ${order.delivery?.deliveryPartner.name ?? 'the delivery partner'}.`,
          metadata: meta(order, { from, to }),
        });
  }
}

export function notifyDeliveryOffered(order: OrderDTO, partnerId: string) {
  notify([partnerId], {
    type: 'delivery.offered',
    title: `New delivery: order ${order.orderNumber}`,
    body: `${order.address.line1}, ${order.address.city} · collect ${money(order.total)} cash`,
    metadata: meta(order),
  });
}

export function notifyDeliveryRejected(order: OrderDTO, reason?: string) {
  notify(restaurantDispatchers(), {
        type: 'delivery.rejected',
        title: `Delivery declined for order ${order.orderNumber}`,
        body: reason ? `Reason: ${reason}. Offer it to another partner.` : 'Offer it to another partner.',
        metadata: meta(order),
      });
}
