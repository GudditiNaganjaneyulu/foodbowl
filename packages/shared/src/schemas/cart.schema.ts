import { z } from 'zod';

export const selectedModifierSchema = z.object({
  modifierGroupId: z.string(),
  modifierId: z.string(),
  name: z.string(),
  priceDelta: z.number(),
});

export const addCartItemSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1).max(20),
  selectedModifiers: z.array(selectedModifierSchema).default([]),
  note: z.string().max(300).optional(),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(20).optional(),
  note: z.string().max(300).optional(),
});
