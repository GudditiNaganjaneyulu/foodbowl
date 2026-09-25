import type { FastifySchema } from 'fastify';
import { PERMISSIONS, assignDeliverySchema, deliveredConfirmationSchema, rejectAssignmentSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod, idParam, protectedErrors, ref, requiresPermission } from '../../lib/openapi';

const assignGate = requiresPermission(PERMISSIONS.DELIVERY_ASSIGN);
const fulfillGate = requiresPermission(PERMISSIONS.DELIVERY_FULFILL);
const orderResponse = (description: string) => ({ description, ...ref('Order') });

export const listPartnersDocs: FastifySchema = {
  tags: ['Delivery'],
  summary: 'List delivery partners',
  description: `Active delivery partners with how many open deliveries each currently has, so staff can pick who to offer an order to. Partner accounts are created from the Users screen.\n\n${assignGate}`,
  security: bearerAuth,
  response: {
    200: { description: 'Active partners.', type: 'array', items: ref('DeliveryPartner') },
    ...errorResponses(protectedErrors),
  },
};

export const assignDocs: FastifySchema = {
  tags: ['Delivery'],
  summary: 'Offer an order to a delivery partner',
  description: `Creates (or re-offers) the delivery assignment for an order that the kitchen has confirmed (\`CONFIRMED\`, \`PREPARING\` or \`READY_FOR_PICKUP\`). An order has one assignment: after a rejection, or while still only *offered*, it is offered to someone else. Once a partner has accepted it can no longer be reassigned. The partner is notified.\n\n${assignGate}`,
  security: bearerAuth,
  body: fromZod(assignDeliverySchema, { example: { orderId: 'cm0abc123def456', deliveryPartnerId: 'cm0xyz789ghi012' } }),
  response: {
    201: orderResponse('Offered. The order now carries a `delivery` block.'),
    ...errorResponses({
      400: 'Validation failed, or not an active delivery partner.',
      ...protectedErrors,
      404: 'No such order.',
      409: 'The order is not in a state that can be assigned, or a partner already accepted it.',
    }),
  },
};

export const myAssignmentsDocs: FastifySchema = {
  tags: ['Delivery'],
  summary: 'My deliveries',
  description: `The logged-in partner's own deliveries with the full order (address, contact, items, amount to collect). \`scope=active\` (default) is offers and deliveries in progress, oldest first; \`scope=history\` is finished, declined and cancelled ones, newest first.\n\n${fulfillGate}`,
  security: bearerAuth,
  querystring: { type: 'object', properties: { scope: { type: 'string', enum: ['active', 'history'], default: 'active' } } },
  response: {
    200: { description: 'My deliveries.', type: 'array', items: ref('DeliveryAssignment') },
    ...errorResponses({ 400: 'Invalid scope.', ...protectedErrors }),
  },
};

const stepErrors = (extra: Record<number, string> = {}) =>
  errorResponses({
    ...protectedErrors,
    ...(extra as Record<400, string>),
    404: 'No such delivery assigned to you.',
    409: 'The delivery is not in a state that allows this step, or the order was cancelled.',
  });

export const acceptDocs: FastifySchema = {
  tags: ['Delivery'],
  summary: 'Accept a delivery offer',
  description: `Only the partner it was offered to can accept.\n\n${fulfillGate}`,
  security: bearerAuth,
  params: idParam,
  response: { 200: orderResponse('The order with its updated delivery.'), ...stepErrors() },
};

export const rejectDocs: FastifySchema = {
  tags: ['Delivery'],
  summary: 'Decline (or back out of) a delivery',
  description: `Allowed while the delivery is \`OFFERED\` or \`ACCEPTED\` — not after pickup. Staff are notified so they can offer it to someone else.\n\n${fulfillGate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(rejectAssignmentSchema, { example: { reason: 'Too far from my location' } }),
  response: { 200: orderResponse('The order, ready to be re-offered.'), ...stepErrors({ 400: 'Validation failed.' }) },
};

export const pickedUpDocs: FastifySchema = {
  tags: ['Delivery'],
  summary: 'Confirm pickup',
  description: `The partner has collected the food from the restaurant. Requires an accepted delivery **and** an order the kitchen has marked \`READY_FOR_PICKUP\`. Moves the order to \`OUT_FOR_DELIVERY\` in the same transaction.\n\n${fulfillGate}`,
  security: bearerAuth,
  params: idParam,
  response: { 200: orderResponse('The order, now out for delivery.'), ...stepErrors() },
};

export const deliveredDocs: FastifySchema = {
  tags: ['Delivery'],
  summary: 'Confirm delivery and cash collected',
  description: `Completes the delivery. \`codCollected\` must be \`true\` — an order is never completed with its cash unaccounted for. In **one transaction** this marks the assignment delivered, the COD payment \`COLLECTED\`, and the order \`DELIVERED\`. \`proofImageUrl\` (optional) is a photo uploaded via \`POST /uploads/sign\`.\n\n${fulfillGate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(deliveredConfirmationSchema, {
    example: { codCollected: true, proofImageUrl: 'https://example.supabase.co/storage/v1/object/public/delivery-proofs/abc.jpg' },
  }),
  response: {
    200: orderResponse('The delivered order, with `paymentStatus: COLLECTED`.'),
    ...stepErrors({ 400: 'Validation failed, or cash collection was not confirmed.' }),
  },
};
