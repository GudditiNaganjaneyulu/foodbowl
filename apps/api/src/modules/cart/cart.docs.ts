import type { FastifySchema } from 'fastify';
import { addCartItemSchema, updateCartItemSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod, idParam, ref } from '../../lib/openapi';

const unauthorized = { 401: 'Missing, invalid or expired access token.' } as const;
const cartResponse = (description: string) => ({ description, ...ref('Cart') });

export const getCartDocs: FastifySchema = {
  tags: ['Cart'],
  summary: 'Get my cart',
  description:
    'One persistent cart per user, so it follows them across devices. Prices are computed from the **current** menu on every read; lines whose item became unavailable are flagged `available: false` and excluded from `subtotal`.',
  security: bearerAuth,
  response: { 200: cartResponse('The current cart.'), ...errorResponses(unauthorized) },
};

export const addCartItemDocs: FastifySchema = {
  tags: ['Cart'],
  summary: 'Add an item to the cart',
  description:
    'Send only ids — names and prices always come from the server. Selections are validated against the item\'s modifier groups (required groups, min/max). Adding the same item with the same modifier set **and the same special instructions** merges into the existing line (quantity capped at 20); different instructions stay on separate lines. The `note` is copied onto the order so the kitchen sees it.',
  security: bearerAuth,
  body: fromZod(addCartItemSchema, {
    example: {
      menuItemId: 'seed-item-1-0',
      quantity: 2,
      selectedModifiers: [{ modifierGroupId: 'seed-modgroup-1-0-0', modifierId: 'seed-modifier-1-0-0-1' }],
      note: 'Less oil please',
    },
  }),
  response: {
    200: cartResponse('The updated cart.'),
    ...errorResponses({
      400: 'Validation failed, or an invalid/missing modifier selection.',
      ...unauthorized,
      404: 'The item does not exist or is not available.',
    }),
  },
};

export const updateCartItemDocs: FastifySchema = {
  tags: ['Cart'],
  summary: 'Change a cart line',
  description: 'Set the quantity (1–20) and/or the special-instructions note of one line (an empty note clears it). To remove a line use DELETE.',
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateCartItemSchema, { example: { quantity: 3 } }),
  response: {
    200: cartResponse('The updated cart.'),
    ...errorResponses({ 400: 'Validation failed.', ...unauthorized, 404: 'No such line in your cart.' }),
  },
};

export const removeCartItemDocs: FastifySchema = {
  tags: ['Cart'],
  summary: 'Remove a cart line',
  security: bearerAuth,
  params: idParam,
  response: {
    200: cartResponse('The updated cart.'),
    ...errorResponses({ ...unauthorized, 404: 'No such line in your cart.' }),
  },
};

export const clearCartDocs: FastifySchema = {
  tags: ['Cart'],
  summary: 'Empty the cart',
  security: bearerAuth,
  response: { 200: cartResponse('The (now empty) cart.'), ...errorResponses(unauthorized) },
};
