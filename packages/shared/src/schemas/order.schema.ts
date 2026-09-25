import { z } from 'zod';
import { ORDER_STATUS } from '../constants/order-status';
import { imageUrlSchema } from './menu.schema';

export const placeOrderSchema = z.object({
  addressId: z.string(),
  notes: z.string().max(500).optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

/**
 * Statuses that staff move an order through by hand. OUT_FOR_DELIVERY and
 * DELIVERED are deliberately absent — they only happen through the delivery
 * workflow (pickup / delivered confirmation), which also records the
 * assignment and the COD payment; CANCELLED has its own endpoint.
 */
export const KITCHEN_STATUSES = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY_FOR_PICKUP,
] as const;

export const advanceOrderStatusSchema = z.object({
  status: z.enum(KITCHEN_STATUSES),
  note: z.string().max(500).optional(),
});
export type AdvanceOrderStatusInput = z.infer<typeof advanceOrderStatusSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const assignDeliverySchema = z.object({
  orderId: z.string(),
  deliveryPartnerId: z.string(),
});
export type AssignDeliveryInput = z.infer<typeof assignDeliverySchema>;

export const rejectAssignmentSchema = z.object({
  reason: z.string().max(300).optional(),
});

export const deliveredConfirmationSchema = z.object({
  codCollected: z.boolean(),
  proofImageUrl: imageUrlSchema.optional(),
});
export type DeliveredConfirmationInput = z.infer<typeof deliveredConfirmationSchema>;
