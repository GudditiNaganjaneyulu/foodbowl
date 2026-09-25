import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export type PaymentMethodKey = 'COD';

export interface PaymentIntentResult {
  paymentStatus: 'PENDING' | 'COLLECTED';
}

/**
 * OrderService talks to this interface only (BUILD_PROMPT.md §8), so adding a
 * gateway later means one new class + one entry in `providers` — no changes
 * to order logic.
 */
export interface PaymentProvider {
  readonly method: PaymentMethodKey;
  createIntent(order: { total: Prisma.Decimal }): Promise<PaymentIntentResult>;
  /** `tx` lets the caller make confirmation part of its own transaction. */
  confirmPayment(orderId: string, meta?: { tx?: Prisma.TransactionClient }): Promise<void>;
}

class CodPaymentProvider implements PaymentProvider {
  readonly method = 'COD' as const;

  async createIntent(): Promise<PaymentIntentResult> {
    return { paymentStatus: 'PENDING' };
  }

  // Called when the delivery partner confirms they collected the cash.
  async confirmPayment(orderId: string, meta?: { tx?: Prisma.TransactionClient }): Promise<void> {
    await (meta?.tx ?? prisma).order.update({ where: { id: orderId }, data: { paymentStatus: 'COLLECTED' } });
  }
}

const providers: Record<PaymentMethodKey, PaymentProvider> = { COD: new CodPaymentProvider() };

export function getPaymentProvider(method: PaymentMethodKey): PaymentProvider {
  return providers[method];
}
