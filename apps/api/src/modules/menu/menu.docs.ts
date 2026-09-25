import type { FastifySchema } from 'fastify';
import {
  PERMISSIONS,
  createCategorySchema,
  createMenuItemSchema,
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
  description: `Deletes the item and, by cascade, its modifier groups and modifiers.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  response: {
    204: { description: 'Item deleted. No body.', type: 'null' },
    ...errorResponses({ ...protectedErrors }),
  },
};
