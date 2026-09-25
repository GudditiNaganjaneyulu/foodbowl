import type { FastifySchema } from 'fastify';
import { PERMISSIONS, updateRestaurantSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod, protectedErrors, ref, requiresPermission } from '../../lib/openapi';

export const getRestaurantDocs: FastifySchema = {
  tags: ['Restaurant'],
  summary: 'Get restaurant details (public)',
  description:
    'Name, hours, minimum order and delivery fee. The storefront uses `isOpen` to decide whether checkout is available.',
  response: {
    200: { description: 'The restaurant.', ...ref('Restaurant') },
    ...errorResponses({}),
  },
};

export const updateRestaurantDocs: FastifySchema = {
  tags: ['Restaurant'],
  summary: 'Update restaurant settings',
  description: `Partial update — send only the fields to change. \`isOpen: false\` immediately stops new orders (orders already placed are unaffected). Audited.\n\n${requiresPermission(PERMISSIONS.RESTAURANT_MANAGE)}`,
  security: bearerAuth,
  body: fromZod(updateRestaurantSchema, {
    example: { isOpen: true, opensAt: '10:00', closesAt: '22:30', minOrderAmount: 5, deliveryFee: 2.5 },
  }),
  response: {
    200: { description: 'The updated restaurant.', ...ref('Restaurant') },
    ...errorResponses({ 400: 'Validation failed.', ...protectedErrors }),
  },
};
