import { z } from 'zod';
import { ORDER_STATUS } from '../constants/order-status';

export const placeOrderSchema = z.object({
  addressId: z.string(),
  notes: z.string().max(500).optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(Object.values(ORDER_STATUS) as [string, ...string[]]),
  note: z.string().max(500).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const assignDeliverySchema = z.object({
  orderId: z.string(),
  deliveryPartnerId: z.string(),
});

export const deliveredConfirmationSchema = z.object({
  codCollected: z.boolean(),
  proofImageUrl: z.string().url().optional(),
});
