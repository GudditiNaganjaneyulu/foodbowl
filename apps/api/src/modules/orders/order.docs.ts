import type { FastifySchema } from 'fastify';
import {
  ORDER_STATUS,
  PERMISSIONS,
  advanceOrderStatusSchema,
  cancelOrderSchema,
  placeOrderSchema,
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

const unauthorized = { 401: 'Missing, invalid or expired access token.' } as const;
const orderResponse = (description: string) => ({ description, ...ref('Order') });
const orderList = (description: string) => ({ description, type: 'array', items: ref('Order') });

export const placeOrderDocs: FastifySchema = {
  tags: ['Orders'],
  summary: 'Place an order from my cart',
  description:
    'Turns the current cart into an order (cash on delivery) in one transaction: re-prices every line from the current menu, **snapshots** names/prices/modifiers into the order, records the first status-log entry (`PLACED`), and empties the cart. An optional `couponCode` (one of the caller\'s own, from `GET /coupons/me`) is validated and redeemed in the same transaction. Nothing is saved if any check fails. The restaurant queue receives a live `order:placed` event.',
  security: bearerAuth,
  body: fromZod(placeOrderSchema, { example: { addressId: 'seed-address-1', notes: 'Ring the bell twice' } }),
  response: {
    201: orderResponse('Order placed.'),
    ...errorResponses({
      400: 'Validation failed, empty cart, unknown address, or below the minimum order.',
      ...unauthorized,
      404: 'The coupon code does not belong to this customer.',
      409: 'The restaurant is closed, an item in the cart is no longer available, or the coupon is already used/expired.',
    }),
  },
};

export const listMyOrdersDocs: FastifySchema = {
  tags: ['Orders'],
  summary: 'My order history',
  description: 'The caller\'s own orders, newest first.',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
  },
  response: { 200: orderList('My orders.'), ...errorResponses({ 400: 'Invalid query.', ...unauthorized }) },
};

export const listOrdersDocs: FastifySchema = {
  tags: ['Orders'],
  summary: 'Restaurant order queue',
  description: `All orders for staff and the owner. With no \`status\` filter it returns **active** orders (everything not delivered/cancelled), **oldest first**, ready to work through. With a filter it returns those statuses **newest first**, which suits history views.\n\n${requiresPermission(PERMISSIONS.ORDERS_VIEW)}`,
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Comma-separated statuses, e.g. `DELIVERED,CANCELLED`.',
        example: 'PLACED,CONFIRMED',
      },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: orderList('Matching orders.'),
    ...errorResponses({ 400: 'Unknown status or invalid limit.', ...protectedErrors }),
  },
};

export const getOrderDocs: FastifySchema = {
  tags: ['Orders'],
  summary: 'Get one order (with status history)',
  description:
    'Visible to the customer who placed it, staff with `orders.view`/`orders.manage`, and the delivery partner assigned to it. Anyone else gets **404** (not 403), so order ids cannot be probed.',
  security: bearerAuth,
  params: idParam,
  response: {
    200: orderResponse('The order, including `statusLogs`.'),
    ...errorResponses({ ...unauthorized, 404: 'No such order, or you may not see it.' }),
  },
};

export const advanceOrderStatusDocs: FastifySchema = {
  tags: ['Orders'],
  summary: 'Advance an order through the kitchen',
  description: `Moves an order forward one step: \`PLACED → CONFIRMED → PREPARING → READY_FOR_PICKUP\`. Only these three targets are accepted here. \`OUT_FOR_DELIVERY\` and \`DELIVERED\` happen through the delivery workflow, and cancellation has its own endpoint. Every change is validated by the state machine, written to the status log, and pushed live (\`order:updated\`).\n\n${requiresPermission(PERMISSIONS.ORDERS_MANAGE)}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(advanceOrderStatusSchema, { example: { status: ORDER_STATUS.CONFIRMED, note: 'Accepted' } }),
  response: {
    200: orderResponse('The updated order.'),
    ...errorResponses({
      400: 'Validation failed (status must be CONFIRMED, PREPARING or READY_FOR_PICKUP).',
      ...protectedErrors,
      404: 'No such order.',
      409: 'Illegal transition from the current status, or someone else changed the order first.',
    }),
  },
};

export const cancelOrderDocs: FastifySchema = {
  tags: ['Orders'],
  summary: 'Cancel an order',
  description:
    'A **customer** can cancel their own order only while it is `PLACED` or `CONFIRMED`. The **owner** or staff with `orders.manage` can cancel while it is `READY_FOR_PICKUP` or `OUT_FOR_DELIVERY` too (e.g. no delivery partner was ever available) — but not once a rider has actually accepted or picked it up (reject their assignment first, via the delivery endpoints). Cancelling from one of those two late states automatically issues the customer a 5%-off coupon (`issuedCoupon` below, also delivered as a notification) since the kitchen already made the food. Cancelled orders are final.',
  security: bearerAuth,
  params: idParam,
  body: fromZod(cancelOrderSchema, { example: { reason: 'Ordered by mistake' } }),
  response: {
    200: {
      description: 'The cancelled order, plus the coupon issued alongside it if this was a late (post-kitchen) cancellation.',
      allOf: [
        ref('Order'),
        { type: 'object', properties: { issuedCoupon: { allOf: [ref('Coupon')], nullable: true } } },
      ],
    },
    ...errorResponses({
      400: 'Validation failed (a reason is required).',
      ...unauthorized,
      403: 'The kitchen already started on it, or it is not yours to cancel.',
      404: 'No such order.',
      409: 'The order can no longer be cancelled from its current status.',
    }),
  },
};
