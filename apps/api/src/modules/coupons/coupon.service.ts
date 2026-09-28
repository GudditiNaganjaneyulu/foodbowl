import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { CouponDTO } from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { HttpError } from '../../lib/http-error';
import { dec, type Money } from '../../lib/money';
import { toCouponDTO } from './coupon.dto';

const CANCELLATION_COUPON_PERCENT = 5;
const CANCELLATION_COUPON_VALID_DAYS = 30;

function generateCode(): string {
  return `SORRY${randomInt(100000, 1000000)}`;
}

/**
 * Issued automatically when staff/owner cancel an order that was already
 * READY_FOR_PICKUP or OUT_FOR_DELIVERY — the kitchen already made the food,
 * so this is the restaurant's fault, not the customer's (see
 * order.service.cancelOrder, which is the only caller). Runs inside the
 * cancellation's own transaction, so the order is never cancelled without
 * the coupon, or the reverse.
 */
export async function issueCancellationCoupon(
  tx: Prisma.TransactionClient,
  userId: string,
  sourceOrderId: string,
  orderNumber: string,
): Promise<CouponDTO> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CANCELLATION_COUPON_VALID_DAYS);

  let coupon: Awaited<ReturnType<typeof tx.coupon.create>> | undefined;
  for (let attempt = 1; !coupon; attempt++) {
    try {
      coupon = await tx.coupon.create({
        data: {
          code: generateCode(),
          userId,
          discountPercent: dec(CANCELLATION_COUPON_PERCENT),
          reason: `Order ${orderNumber} was cancelled — no delivery partner was available. Sorry about that!`,
          sourceOrderId,
          expiresAt,
        },
      });
    } catch (err) {
      // A random 6-digit code colliding is astronomically unlikely; just draw another.
      if (attempt >= 5) throw err;
    }
  }
  return toCouponDTO(coupon);
}

export async function listMyCoupons(userId: string): Promise<CouponDTO[]> {
  const rows = await prisma.coupon.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  // Flip anything stale to EXPIRED for display only — no cron needed for a
  // handful of coupons; redeemCoupon below re-checks expiresAt regardless.
  const now = new Date();
  return rows.map((r) => toCouponDTO(r.status === 'ACTIVE' && r.expiresAt < now ? { ...r, status: 'EXPIRED' } : r));
}

/**
 * Validates a coupon belongs to this customer and is usable, and returns the
 * discount to apply. Does NOT mark it used — the caller (order.service's
 * createOrderFromCart) does that once the order actually exists, atomically
 * in the same transaction, via markCouponUsed.
 */
export async function redeemCoupon(
  tx: Prisma.TransactionClient,
  userId: string,
  code: string,
  subtotal: Money,
): Promise<{ couponId: string; discount: Money }> {
  const coupon = await tx.coupon.findUnique({ where: { code } });
  if (!coupon || coupon.userId !== userId) throw new HttpError('Coupon not found', 404);
  if (coupon.status !== 'ACTIVE') throw new HttpError(`This coupon has already been ${coupon.status.toLowerCase()}`, 409);
  if (coupon.expiresAt < new Date()) throw new HttpError('This coupon has expired', 409);
  const discount = subtotal.times(coupon.discountPercent).dividedBy(100).toDecimalPlaces(2);
  return { couponId: coupon.id, discount };
}

export async function markCouponUsed(tx: Prisma.TransactionClient, couponId: string, orderId: string) {
  // Compare-and-set, same reasoning as Order's own status updates: two
  // concurrent checkouts racing the same coupon must not both win.
  const { count } = await tx.coupon.updateMany({
    where: { id: couponId, status: 'ACTIVE' },
    data: { status: 'USED', usedAt: new Date(), usedOnOrderId: orderId },
  });
  if (count !== 1) throw new HttpError('This coupon was just used elsewhere — remove it and try again', 409);
}
