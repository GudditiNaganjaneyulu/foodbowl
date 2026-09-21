import { z } from 'zod';

export const modifierSchema = z.object({
  name: z.string().min(1).max(80),
  priceDelta: z.number().default(0),
});

export const modifierGroupSchema = z.object({
  name: z.string().min(1).max(80),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
  modifiers: z.array(modifierSchema).default([]),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createMenuItemSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  price: z.number().positive(),
  imageUrl: z.string().url().optional(),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  modifierGroups: z.array(modifierGroupSchema).default([]),
});
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;

// Modifier groups aren't editable through this simple PATCH — they need their
// own create/delete endpoints since they're a nested relation, not a scalar
// field. Left out here rather than accepted and silently ignored.
export const updateMenuItemSchema = createMenuItemSchema
  .partial()
  .omit({ categoryId: true, modifierGroups: true });
