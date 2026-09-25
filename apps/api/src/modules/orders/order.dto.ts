import type { Prisma } from '@prisma/client';
import type {
  DeliveryDTO,
  OrderDTO,
  OrderItemDTO,
  OrderStatus,
  OrderStatusLogDTO,
} from '@foodbowl/shared';
import { fmt } from '../../lib/money';

export const orderInclude = {
  user: { select: { id: true, name: true, email: true, phone: true } },
  address: true,
  items: { orderBy: { id: 'asc' }, include: { menuItem: { select: { imageUrl: true } } } },
  deliveryAssignment: {
    include: { deliveryPartner: { select: { id: true, name: true, phone: true } } },
  },
} satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  ...orderInclude,
  statusLogs: {
    orderBy: { createdAt: 'asc' },
    include: { changedBy: { select: { id: true, name: true, role: { select: { key: true } } } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

type AssignmentRow = NonNullable<OrderRow['deliveryAssignment']>;

export function toDeliveryDTO(a: AssignmentRow): DeliveryDTO {
  return {
    id: a.id,
    status: a.status,
    deliveryPartner: { id: a.deliveryPartner.id, name: a.deliveryPartner.name, phone: a.deliveryPartner.phone },
    assignedAt: a.assignedAt.toISOString(),
    acceptedAt: a.acceptedAt?.toISOString() ?? null,
    pickedUpAt: a.pickedUpAt?.toISOString() ?? null,
    deliveredAt: a.deliveredAt?.toISOString() ?? null,
    codCollected: a.codCollected,
    proofImageUrl: a.proofImageUrl,
  };
}

/** Modifier snapshot written at order time: [{ name, priceDelta }] (extra keys ignored). */
function readModifierSnapshot(json: Prisma.JsonValue): { name: string; priceDelta: string }[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((m) => {
    if (m && typeof m === 'object' && !Array.isArray(m) && typeof m.name === 'string') {
      return [{ name: m.name, priceDelta: String(m.priceDelta ?? '0.00') }];
    }
    return [];
  });
}

export function toOrderItemDTO(i: OrderRow['items'][number]): OrderItemDTO {
  return {
    id: i.id,
    menuItemId: i.menuItemId,
    name: i.nameSnapshot,
    imageUrl: i.menuItem.imageUrl,
    note: i.note,
    unitPrice: fmt(i.priceSnapshot),
    quantity: i.quantity,
    modifiers: readModifierSnapshot(i.selectedModifiers),
    lineTotal: fmt(i.lineTotal),
  };
}

export function toOrderDTO(order: OrderRow | OrderDetailRow): OrderDTO {
  const logs = 'statusLogs' in order ? order.statusLogs : undefined;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status as OrderStatus,
    subtotal: fmt(order.subtotal),
    deliveryFee: fmt(order.deliveryFee),
    discount: fmt(order.discount),
    total: fmt(order.total),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancellationReason: order.cancellationReason,
    notes: order.notes,
    customer: {
      id: order.user.id,
      name: order.user.name,
      email: order.user.email,
      phone: order.user.phone,
    },
    address: {
      id: order.address.id,
      label: order.address.label,
      line1: order.address.line1,
      line2: order.address.line2,
      city: order.address.city,
      state: order.address.state,
      postalCode: order.address.postalCode,
      lat: order.address.lat,
      lng: order.address.lng,
    },
    items: order.items.map(toOrderItemDTO),
    delivery: order.deliveryAssignment ? toDeliveryDTO(order.deliveryAssignment) : null,
    ...(logs && {
      statusLogs: logs.map(
        (l): OrderStatusLogDTO => ({
          id: l.id,
          fromStatus: l.fromStatus as OrderStatus | null,
          toStatus: l.toStatus as OrderStatus,
          note: l.note,
          createdAt: l.createdAt.toISOString(),
          changedBy: l.changedBy
            ? { id: l.changedBy.id, name: l.changedBy.name, role: l.changedBy.role.key }
            : null,
        }),
      ),
    }),
  };
}
