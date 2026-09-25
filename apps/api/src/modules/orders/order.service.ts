import { Prisma } from '@prisma/client';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  ORDER_STATUS,
  TERMINAL_STATUSES,
  type OrderDTO,
  type OrderStatus,
  type PlaceOrderInput,
} from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { HttpError } from '../../lib/http-error';
import { logger } from '../../lib/logger';
import { fmt, ZERO } from '../../lib/money';
import { getPaymentProvider } from '../../lib/payment';
import { getActor, type Actor } from '../../lib/rbac';
import { cartInclude, priceCartLine } from '../cart/cart.service';
import { sumMoney } from '../cart/pricing';
import { orderDetailInclude, orderInclude, toOrderDTO, type OrderDetailRow } from './order.dto';
import { publishOrderPlaced, publishOrderUpdated } from './order.events';
import { canViewOrder, authorizeTransition } from './order-rules';

const tracer = trace.getTracer('foodbowl-api');

const ACTIVE_STATUSES = Object.values(ORDER_STATUS).filter((s) => !TERMINAL_STATUSES.includes(s));

function generateOrderNumber(): string {
  return `FB-${Math.floor(100000 + Math.random() * 900000)}`;
}

function isOrderNumberCollision(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    String(err.meta?.target ?? '').includes('orderNumber')
  );
}

/** Runs `fn` inside a span, recording failures on it, and always ends the span. */
async function withSpan<T>(name: string, attributes: Record<string, string | number>, fn: () => Promise<T>) {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

// ── Placement ─────────────────────────────────────────────────────────────

async function createOrderFromCart(tx: Prisma.TransactionClient, userId: string, input: PlaceOrderInput) {
  const restaurant = await tx.restaurant.findFirstOrThrow();
  if (!restaurant.isOpen) {
    throw new HttpError('The restaurant is currently closed and not accepting orders', 409);
  }

  const address = await tx.address.findFirst({ where: { id: input.addressId, userId } });
  if (!address) throw new HttpError('Choose a valid delivery address', 400);

  const cart = await tx.cart.findUnique({ where: { userId }, include: cartInclude });
  if (!cart || cart.items.length === 0) throw new HttpError('Your cart is empty', 400);

  const priced = cart.items.map(priceCartLine);
  const unavailable = priced.filter((p) => !p.available);
  if (unavailable.length > 0) {
    const names = unavailable.map((p) => `"${p.line.menuItem.name}"`).join(', ');
    throw new HttpError(`${names} ${unavailable.length === 1 ? 'is' : 'are'} no longer available — remove from your cart to continue`, 409);
  }

  const subtotal = sumMoney(priced.map((p) => p.total));
  if (subtotal.lessThan(restaurant.minOrderAmount)) {
    throw new HttpError(`The minimum order is $${fmt(restaurant.minOrderAmount)}`, 400);
  }
  const deliveryFee = restaurant.deliveryFee;
  const discount = ZERO;
  const total = subtotal.plus(deliveryFee).minus(discount);

  const intent = await getPaymentProvider('COD').createIntent({ total });

  const order = await tx.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      userId,
      addressId: address.id,
      status: ORDER_STATUS.PLACED,
      subtotal,
      deliveryFee,
      discount,
      total,
      paymentMethod: 'COD',
      paymentStatus: intent.paymentStatus,
      notes: input.notes,
      // Prices and names are copied, not referenced: later menu edits must
      // never change what a past order says it cost.
      items: {
        create: priced.map((p) => ({
          menuItemId: p.line.menuItemId,
          nameSnapshot: p.line.menuItem.name,
          priceSnapshot: p.unit,
          quantity: p.line.quantity,
          note: p.line.note,
          lineTotal: p.total,
          selectedModifiers: p.modifiers.map((m) => ({
            modifierGroupId: m.modifierGroupId,
            modifierId: m.modifierId,
            name: m.name,
            priceDelta: fmt(m.priceDelta),
          })) as Prisma.InputJsonValue,
        })),
      },
      statusLogs: { create: { fromStatus: null, toStatus: ORDER_STATUS.PLACED, changedByUserId: userId } },
    },
    include: orderDetailInclude,
  });

  await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
  return order;
}

export async function placeOrder(userId: string, input: PlaceOrderInput): Promise<OrderDTO> {
  return withSpan('order.place', { 'user.id': userId }, async () => {
    let row: OrderDetailRow | undefined;
    for (let attempt = 1; !row; attempt++) {
      try {
        row = await prisma.$transaction((tx) => createOrderFromCart(tx, userId, input));
      } catch (err) {
        // Random 6-digit numbers can (rarely) collide; just draw another.
        if (!isOrderNumberCollision(err) || attempt >= 5) throw err;
      }
    }

    const dto = toOrderDTO(row);
    trace.getActiveSpan()?.setAttributes({
      'order.id': dto.id,
      'order.number': dto.orderNumber,
      'order.total': dto.total,
      'order.items': dto.items.length,
    });
    logger.info({ orderId: dto.id, orderNumber: dto.orderNumber, userId, total: dto.total }, 'order placed');
    publishOrderPlaced(dto);
    return dto;
  });
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listMyOrders(userId: string, limit = 30): Promise<OrderDTO[]> {
  const rows = await prisma.order.findMany({
    where: { userId },
    orderBy: { placedAt: 'desc' },
    take: limit,
    include: orderInclude,
  });
  return rows.map(toOrderDTO);
}

export async function listOrders(filter: { statuses?: OrderStatus[]; limit?: number }): Promise<OrderDTO[]> {
  const statuses = filter.statuses?.length ? filter.statuses : ACTIVE_STATUSES;
  const active = !filter.statuses?.length;
  const rows = await prisma.order.findMany({
    where: { status: { in: statuses } },
    // The live queue is worked oldest-first; history views want newest-first.
    orderBy: { placedAt: active ? 'asc' : 'desc' },
    take: filter.limit ?? 50,
    include: orderInclude,
  });
  return rows.map(toOrderDTO);
}

/** 404 (not 403) when the actor may not see the order, so ids can't be probed. */
export async function getOrder(orderId: string, userId: string): Promise<OrderDTO> {
  const actor = await getActor(userId);
  const row = await prisma.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  if (
    !row ||
    !canViewOrder(actor, {
      customerId: row.userId,
      assignedPartnerId: row.deliveryAssignment?.deliveryPartnerId ?? null,
    })
  ) {
    throw new HttpError('Order not found', 404);
  }
  return toOrderDTO(row);
}

// ── State machine ─────────────────────────────────────────────────────────

export interface TransitionOptions {
  note?: string;
  cancellationReason?: string;
}

export interface TransitionResult {
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  order: OrderDetailRow;
}

/**
 * The ONLY code that changes Order.status after creation (BUILD_PROMPT.md
 * §4.1). Validates the move, authorizes the actor, writes the status log —
 * all inside the caller's transaction so multi-step flows (e.g. delivery
 * confirmation) can make it atomic with their own writes. Side effects run
 * afterwards via publishTransition, only once the transaction has committed.
 */
export async function applyTransition(
  tx: Prisma.TransactionClient,
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  options: TransitionOptions = {},
): Promise<TransitionResult> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { deliveryAssignment: { select: { deliveryPartnerId: true } } },
  });
  const access = order && {
    customerId: order.userId,
    assignedPartnerId: order.deliveryAssignment?.deliveryPartnerId ?? null,
  };
  if (!order || !access || !canViewOrder(actor, access)) throw new HttpError('Order not found', 404);

  const from = order.status as OrderStatus;
  const decision = authorizeTransition({ from, to, actor, order: access });
  if (!decision.allowed) {
    logger.warn({ orderId, from, to, userId: actor.userId, role: actor.role }, 'order transition denied');
    throw new HttpError(decision.message, decision.statusCode);
  }

  const now = new Date();
  const { count } = await tx.order.updateMany({
    // Compare-and-set on the status we read: if two people click at once,
    // exactly one wins and the other gets a clear 409 instead of a silent overwrite.
    where: { id: orderId, status: order.status },
    data: {
      status: to,
      ...(to === ORDER_STATUS.CANCELLED && { cancelledAt: now, cancellationReason: options.cancellationReason }),
      ...(to === ORDER_STATUS.DELIVERED && { deliveredAt: now }),
    },
  });
  if (count !== 1) {
    throw new HttpError('This order was just updated by someone else — refresh and try again', 409);
  }

  await tx.orderStatusLog.create({
    data: {
      orderId,
      fromStatus: from,
      toStatus: to,
      changedByUserId: actor.userId,
      note: options.note ?? options.cancellationReason ?? null,
    },
  });

  const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderDetailInclude });
  return { from, to, actor, order: updated };
}

/** Post-commit side effects for a completed transition. Never throws. */
export function publishTransition(result: TransitionResult): OrderDTO {
  const dto = toOrderDTO(result.order);
  trace.getActiveSpan()?.addEvent('order.status_changed', {
    'order.id': dto.id,
    'order.from': result.from,
    'order.status': result.to,
    'user.role': result.actor.role,
  });
  logger.info(
    { orderId: dto.id, from: result.from, to: result.to, userId: result.actor.userId, role: result.actor.role },
    'order status changed',
  );
  publishOrderUpdated(dto, { from: result.from, to: result.to, actorId: result.actor.userId });
  return dto;
}

export async function transition(
  orderId: string,
  to: OrderStatus,
  userId: string,
  options: TransitionOptions = {},
): Promise<OrderDTO> {
  return withSpan('order.transition', { 'order.id': orderId, 'order.status': to }, async () => {
    const actor = await getActor(userId);
    const result = await prisma.$transaction((tx) => applyTransition(tx, orderId, to, actor, options));
    return publishTransition(result);
  });
}

export const advanceOrder = (orderId: string, userId: string, to: OrderStatus, note?: string) =>
  transition(orderId, to, userId, { note });

export const cancelOrder = (orderId: string, userId: string, reason: string) =>
  transition(orderId, ORDER_STATUS.CANCELLED, userId, { cancellationReason: reason });

