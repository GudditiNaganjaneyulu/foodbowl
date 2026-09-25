import { z } from 'zod';

/**
 * A photo location: an http(s) URL, or a path on the web app itself such as
 * "/menu/butter-chicken.jpg" (the bundled seed photos). Other schemes
 * (javascript:, data:) are rejected because these end up in <img src>/<a href>.
 */
export const imageUrlSchema = z.union([
  z.string().url().refine((u) => /^https?:\/\//i.test(u), { message: 'Must be an http(s) URL' }),
  z.string().regex(/^\/[A-Za-z0-9._~\-\/]+$/, 'Must be an http(s) URL or a path starting with /'),
]);

export const modifierSchema = z.object({
  name: z.string().min(1).max(80),
  priceDelta: z.number().default(0),
});

export const modifierGroupSchema = z
  .object({
    name: z.string().min(1).max(80),
    minSelect: z.number().int().min(0).default(0),
    maxSelect: z.number().int().min(1).default(1),
    required: z.boolean().default(false),
    modifiers: z.array(modifierSchema).default([]),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'minSelect cannot be greater than maxSelect', path: ['minSelect'] })
  .refine((g) => !g.required || g.modifiers.length > 0, {
    message: 'A required group needs at least one option',
    path: ['modifiers'],
  });
export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;

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
  imageUrl: imageUrlSchema.optional(),
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
  .omit({ categoryId: true, modifierGroups: true })
  // On update these can be cleared with null (create just leaves them out).
  .extend({
    description: z.string().max(1000).nullable().optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
  });

export const updateCategorySchema = createCategorySchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
