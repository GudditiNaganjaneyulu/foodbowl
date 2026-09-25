import { Prisma } from '@prisma/client';
import {
  ORDER_STATUS,
  ROLES,
  TERMINAL_STATUSES,
  type AssignDeliveryInput,
  type DeliveredConfirmationInput,
  type DeliveryAssignmentWithOrderDTO,
  type DeliveryPartnerDTO,
  type OrderDTO,
  type OrderStatus,
} from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { HttpError } from '../../lib/http-error';
import { logger } from '../../lib/logger';
import { getPaymentProvider } from '../../lib/payment';
import { getActor } from '../../lib/rbac';
import { orderInclude, orderDetailInclude, toDeliveryDTO, toOrderDTO } from '../orders/order.dto';
import { publishOrderUpdated } from '../orders/order.events';
import { applyTransition, publishTransition } from '../orders/order.service';
import { notifyDeliveryOffered, notifyDeliveryRejected } from '../notifications/notification.events';

const OPEN_STATUSES = ['OFFERED', 'ACCEPTED', 'PICKED_UP'] as const;
/** An order can be offered to a rider once the kitchen has accepted it, until pickup. */
const OFFERABLE: readonly OrderStatus[] = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY_FOR_PICKUP,
];

const assignmentInclude = {
  deliveryPartner: { select: { id: true, name: true, phone: true } },
  order: { include: orderInclude },
} satisfies Prisma.DeliveryAssignmentInclude;

type AssignmentRow = Prisma.DeliveryAssignmentGetPayload<{ include: typeof assignmentInclude }>;

function toAssignmentDTO(row: AssignmentRow): DeliveryAssignmentWithOrderDTO {
  return { ...toDeliveryDTO(row), order: toOrderDTO(row.order) };
}

async function orderDTO(orderId: string): Promise<OrderDTO> {
  return toOrderDTO(await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderDetailInclude }));
}

/** The rider's own assignment, or 404 — never reveals other riders' work. */
async function ownAssignment(partnerId: string, id: string) {
  const row = await prisma.deliveryAssignment.findFirst({
    where: { id, deliveryPartnerId: partnerId },
    include: { order: { select: { id: true, status: true } } },
  });
  if (!row) throw new HttpError('Delivery assignment not found', 404);
  if (row.order.status === ORDER_STATUS.CANCELLED) {
    throw new HttpError('This order was cancelled', 409);
  }
  return row;
}

export async function listPartners(): Promise<DeliveryPartnerDTO[]> {
  const partners = await prisma.user.findMany({
    where: { isActive: true, role: { key: ROLES.DELIVERY_PARTNER } },
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: 'asc' },
  });
  const open = await prisma.deliveryAssignment.groupBy({
    by: ['deliveryPartnerId'],
    where: { status: { in: [...OPEN_STATUSES] }, order: { status: { notIn: TERMINAL_STATUSES } } },
    _count: { _all: true },
  });
  const counts = new Map(open.map((o) => [o.deliveryPartnerId, o._count._all]));
  return partners.map((p) => ({ ...p, activeAssignments: counts.get(p.id) ?? 0 }));
}

export async function offerToPartner(actorUserId: string, input: AssignDeliveryInput): Promise<OrderDTO> {
  const [order, partner] = await Promise.all([
    prisma.order.findUnique({ where: { id: input.orderId }, include: { deliveryAssignment: true } }),
    prisma.user.findFirst({
      where: { id: input.deliveryPartnerId, isActive: true, role: { key: ROLES.DELIVERY_PARTNER } },
      select: { id: true },
    }),
  ]);
  if (!order) throw new HttpError('Order not found', 404);
  if (!partner) throw new HttpError('Choose an active delivery partner', 400);
  if (!OFFERABLE.includes(order.status as OrderStatus)) {
    throw new HttpError(
      order.status === ORDER_STATUS.PLACED
        ? 'Confirm the order before assigning a delivery partner'
        : `An order that is ${order.status} cannot be assigned`,
      409,
    );
  }

  const existing = order.deliveryAssignment;
  if (existing && !['OFFERED', 'REJECTED'].includes(existing.status)) {
    throw new HttpError('A delivery partner has already accepted this order', 409);
  }

  const data = {
    deliveryPartnerId: partner.id,
    assignedByUserId: actorUserId,
    status: 'OFFERED' as const,
    assignedAt: new Date(),
    acceptedAt: null,
  };
  // orderId is unique: an order has one assignment row, which is re-offered
  // (not duplicated) after a rejection or a change of mind.
  const assignment = existing
    ? await prisma.deliveryAssignment.update({ where: { id: existing.id }, data })
    : await prisma.deliveryAssignment.create({ data: { ...data, orderId: order.id } });

  await writeAudit(actorUserId, 'delivery.offer', 'Order', order.id, { deliveryPartnerId: partner.id });
  logger.info({ orderId: order.id, assignmentId: assignment.id, partnerId: partner.id }, 'delivery offered');

  const dto = await orderDTO(order.id);
  publishOrderUpdated(dto);
  notifyDeliveryOffered(dto, partner.id);
  return dto;
}

export async function listMyAssignments(
  partnerId: string,
  scope: 'active' | 'history' = 'active',
): Promise<DeliveryAssignmentWithOrderDTO[]> {
  const active = {
    status: { in: [...OPEN_STATUSES] },
    order: { status: { notIn: TERMINAL_STATUSES } },
  } satisfies Prisma.DeliveryAssignmentWhereInput;
  const rows = await prisma.deliveryAssignment.findMany({
    where: { deliveryPartnerId: partnerId, ...(scope === 'active' ? active : { NOT: active }) },
    include: assignmentInclude,
    orderBy: { assignedAt: scope === 'active' ? 'asc' : 'desc' },
    take: 100,
  });
  return rows.map(toAssignmentDTO);
}

export async function acceptAssignment(partnerId: string, id: string): Promise<OrderDTO> {
  const row = await ownAssignment(partnerId, id);
  const { count } = await prisma.deliveryAssignment.updateMany({
    where: { id, status: 'OFFERED' },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  if (count !== 1) throw new HttpError(`This offer is ${row.status.toLowerCase()} and can no longer be accepted`, 409);
  const dto = await orderDTO(row.orderId);
  publishOrderUpdated(dto);
  return dto;
}

export async function rejectAssignment(partnerId: string, id: string, reason?: string): Promise<OrderDTO> {
  const row = await ownAssignment(partnerId, id);
  // A rider may decline an offer, or back out after accepting — but not once they hold the food.
  const { count } = await prisma.deliveryAssignment.updateMany({
    where: { id, status: { in: ['OFFERED', 'ACCEPTED'] } },
    data: { status: 'REJECTED', acceptedAt: null },
  });
  if (count !== 1) throw new HttpError(`This delivery is ${row.status.toLowerCase()} and cannot be declined`, 409);
  await writeAudit(partnerId, 'delivery.reject', 'Order', row.orderId, { reason: reason ?? null });
  const dto = await orderDTO(row.orderId);
  publishOrderUpdated(dto);
  notifyDeliveryRejected(dto, reason);
  return dto;
}

export async function markPickedUp(partnerId: string, id: string): Promise<OrderDTO> {
  const row = await ownAssignment(partnerId, id);
  if (row.status !== 'ACCEPTED') {
    throw new HttpError(
      row.status === 'OFFERED' ? 'Accept the delivery before picking it up' : `This delivery is already ${row.status.toLowerCase()}`,
      409,
    );
  }
  if (row.order.status !== ORDER_STATUS.READY_FOR_PICKUP) {
    throw new HttpError('The kitchen has not marked this order ready for pickup yet', 409);
  }
  const actor = await getActor(partnerId);
  const result = await prisma.$transaction(async (tx) => {
    await tx.deliveryAssignment.update({ where: { id }, data: { status: 'PICKED_UP', pickedUpAt: new Date() } });
    return applyTransition(tx, row.orderId, ORDER_STATUS.OUT_FOR_DELIVERY, actor, { note: 'Picked up by delivery partner' });
  });
  return publishTransition(result);
}

export async function markDelivered(
  partnerId: string,
  id: string,
  input: DeliveredConfirmationInput,
): Promise<OrderDTO> {
  const row = await ownAssignment(partnerId, id);
  if (row.status !== 'PICKED_UP') {
    throw new HttpError('Only a picked-up delivery can be marked delivered', 409);
  }
  if (!input.codCollected) {
    throw new HttpError('Confirm that you collected the cash before completing the delivery', 400);
  }
  const actor = await getActor(partnerId);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.deliveryAssignment.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        deliveredAt: now,
        codCollected: true,
        codCollectedAt: now,
        proofImageUrl: input.proofImageUrl ?? null,
      },
    });
    // Same transaction as the status change: an order is never DELIVERED
    // with its cash still marked pending, or the reverse.
    await getPaymentProvider('COD').confirmPayment(row.orderId, { tx });
    return applyTransition(tx, row.orderId, ORDER_STATUS.DELIVERED, actor, { note: 'Delivered, cash collected' });
  });
  return publishTransition(result);
}
