import type { FastifySchema } from 'fastify';
import {
  PERMISSIONS,
  createCategorySchema,
  createMenuItemSchema,
  modifierGroupSchema,
  updateCategorySchema,
  updateMenuItemSchema,
} from '@foodbowl/shared';
import {
  bearerAuth,
  errorResponses,
  fromZod,
  idParam,
  protectedErrors,
  ref,
  requiresPermission,
} from '../../lib/openapi';

const gate = requiresPermission(PERMISSIONS.MENU_MANAGE);

export const getMenuDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Browse the menu (public)',
  description:
    'No authentication required. Returns active categories (by `sortOrder`), each with its available items and their modifier groups. Cached in Redis for 60 seconds when Redis is configured; every menu write below invalidates the cache immediately.',
  response: {
    200: { description: 'The customer-facing menu.', ...ref('MenuResponse') },
    ...errorResponses({}),
  },
};

export const createCategoryDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Create a category',
  description: `Adds a category to the restaurant.\n\n${gate}`,
  security: bearerAuth,
  body: fromZod(createCategorySchema, { example: { name: 'Starters', sortOrder: 1 } }),
  response: {
    201: { description: 'Category created.', ...ref('Category') },
    ...errorResponses({ 400: 'Validation failed.', ...protectedErrors }),
  },
};

export const createMenuItemDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Create a menu item',
  description: `Creates an item together with its modifier groups and modifiers in one call. \`price\` and modifier \`priceDelta\` are sent as numbers but returned as decimal strings.\n\n${gate}`,
  security: bearerAuth,
  body: fromZod(createMenuItemSchema, {
    example: {
      categoryId: 'cm0abc123def456',
      name: 'Paneer Tikka',
      description: 'Char-grilled cottage cheese with mint chutney.',
      price: 249,
      imageUrl: 'https://images.unsplash.com/photo-example',
      isVeg: true,
      isAvailable: true,
      sortOrder: 1,
      modifierGroups: [
        {
          name: 'Toppings',
          minSelect: 0,
          maxSelect: 2,
          required: false,
          modifiers: [{ name: 'Extra cheese', priceDelta: 20 }],
        },
      ],
    },
  }),
  response: {
    201: { description: 'Item created, including its modifier groups.', ...ref('MenuItem') },
    ...errorResponses({ 400: 'Validation failed.', ...protectedErrors }),
  },
};

export const updateMenuItemDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Update a menu item',
  description: `Partial update — send only the fields to change. \`categoryId\` and \`modifierGroups\` are not editable here; unknown fields are ignored. The response omits \`modifierGroups\`.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateMenuItemSchema, { example: { price: 269, isAvailable: false } }),
  response: {
    200: { description: 'Updated item.', ...ref('MenuItem') },
    ...errorResponses({ 400: 'Validation failed.', ...protectedErrors }),
  },
};

export const deleteMenuItemDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Delete a menu item',
  description: `Deletes the item, its modifier groups and modifiers, and removes it from any carts. An item that appears in **past orders** cannot be deleted (order history must stay intact) — set \`isAvailable: false\` instead.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  response: {
    204: { description: 'Item deleted. No body.', type: 'null' },
    ...errorResponses({
      ...protectedErrors,
      404: 'No such item.',
      409: 'The item appears in past orders — mark it unavailable instead.',
    }),
  },
};

export const adminMenuDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Full menu for management',
  description: `Every category (including inactive ones) with every item (including unavailable ones) and their modifier groups, ordered by \`sortOrder\`. Unlike \`GET /menu\` this is never cached.\n\n${gate}`,
  security: bearerAuth,
  response: {
    200: {
      description: 'The whole menu.',
      type: 'object',
      properties: { categories: { type: 'array', items: ref('CategoryWithItems') } },
    },
    ...errorResponses(protectedErrors),
  },
};

export const updateCategoryDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Update a category',
  description: `Rename, reorder, or hide a category (\`isActive: false\` removes it and its items from the public menu without deleting anything).\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateCategorySchema, { example: { name: 'Starters & Snacks', isActive: true } }),
  response: {
    200: { description: 'The updated category.', ...ref('Category') },
    ...errorResponses({ 400: 'Validation failed.', ...protectedErrors, 404: 'No such category.' }),
  },
};

export const createModifierGroupDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Add a modifier group to an item',
  description: `Adds a customization group (size, spice level, add-ons) with its options. \`minSelect\` must not exceed \`maxSelect\`, and a \`required\` group needs at least one option (a required group always demands at least one choice). Existing carts that already contain the item are unaffected until the customer next checks out.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(modifierGroupSchema, {
    example: {
      name: 'Portion Size',
      minSelect: 1,
      maxSelect: 1,
      required: true,
      modifiers: [
        { name: 'Regular', priceDelta: 0 },
        { name: 'Large', priceDelta: 3 },
      ],
    },
  }),
  response: {
    201: { description: 'The created group with its options.', ...ref('ModifierGroup') },
    ...errorResponses({ 400: 'Validation failed.', ...protectedErrors, 404: 'No such item.' }),
  },
};

export const deleteModifierGroupDocs: FastifySchema = {
  tags: ['Menu'],
  summary: 'Delete a modifier group',
  description: `Removes the group and its options. Cart lines that had chosen one of its options are flagged unavailable until removed; past orders keep their own snapshot.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  response: {
    204: { description: 'Deleted. No body.', type: 'null' },
    ...errorResponses({ ...protectedErrors, 404: 'No such modifier group.' }),
  },
};
