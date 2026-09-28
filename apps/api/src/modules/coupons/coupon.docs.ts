import type { FastifySchema } from 'fastify';
import { bearerAuth, errorResponses, ref } from '../../lib/openapi';

export const listMyCouponsDocs: FastifySchema = {
  tags: ['Coupons'],
  summary: 'My coupons',
  description:
    'Coupons belonging to the current customer, newest first. Today the only source is a goodwill discount issued automatically when staff/owner cancel an order that was already ready or out for delivery (see the `cancel order` endpoint). Redeem an active one at checkout with `couponCode` on `POST /orders`.',
  security: bearerAuth,
  response: {
    200: { description: 'Coupons.', type: 'array', items: ref('Coupon') },
    ...errorResponses({ 401: 'Missing, invalid or expired access token.' }),
  },
};
