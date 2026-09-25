import { z } from 'zod';

/**
 * Clients send only ids — names and price deltas are resolved server-side
 * from the database, so a tampered request can never change what an item costs.
 */
export const selectedModifierInputSchema = z.object({
  modifierGroupId: z.string(),
  modifierId: z.string(),
});
export type SelectedModifierInput = z.infer<typeof selectedModifierInputSchema>;

export const MAX_LINE_QUANTITY = 20;

export const addCartItemSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
  selectedModifiers: z.array(selectedModifierInputSchema).default([]),
  note: z.string().max(300).optional(),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).optional(),
    note: z.string().max(300).nullable().optional(),
  })
  .refine((v) => v.quantity !== undefined || v.note !== undefined, { message: 'Nothing to update' });
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
