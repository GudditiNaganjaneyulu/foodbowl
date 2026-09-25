import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ORDER_STATUS,
  PERMISSIONS,
  advanceOrderStatusSchema,
  cancelOrderSchema,
  placeOrderSchema,
  type OrderStatus,
} from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import { HttpError } from '../../lib/http-error';
import * as orderService from './order.service';
import {
  advanceOrderStatusDocs,
  cancelOrderDocs,
  getOrderDocs,
  listMyOrdersDocs,
  listOrdersDocs,
  placeOrderDocs,
} from './order.docs';

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function parseStatuses(csv: string | undefined): OrderStatus[] | undefined {
  if (!csv) return undefined;
  const valid = Object.values(ORDER_STATUS) as string[];
  const parts = csv.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = parts.find((p) => !valid.includes(p));
  if (bad) throw new HttpError(`Unknown order status: ${bad}`, 400);
  return parts as OrderStatus[];
}

export default async function orderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);

  fastify.post('/', { schema: placeOrderDocs }, async (request, reply) => {
    const body = placeOrderSchema.parse(request.body);
    return reply.code(201).send(await orderService.placeOrder(request.user!.sub, body));
  });

  // Registered before '/:id' so "me" is never read as an id.
  fastify.get('/me', { schema: listMyOrdersDocs }, async (request) => {
    const { limit } = listQuerySchema.parse(request.query);
    return orderService.listMyOrders(request.user!.sub, limit);
  });

  fastify.get(
    '/',
    { schema: listOrdersDocs, preHandler: requirePermission(PERMISSIONS.ORDERS_VIEW) },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      return orderService.listOrders({ statuses: parseStatuses(query.status), limit: query.limit });
    },
  );

  fastify.get('/:id', { schema: getOrderDocs }, async (request) => {
    const { id } = request.params as { id: string };
    return orderService.getOrder(id, request.user!.sub);
  });

  fastify.patch(
    '/:id/status',
    { schema: advanceOrderStatusDocs, preHandler: requirePermission(PERMISSIONS.ORDERS_MANAGE) },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = advanceOrderStatusSchema.parse(request.body);
      return orderService.advanceOrder(id, request.user!.sub, body.status, body.note);
    },
  );

  // No permission gate here: customers cancel their own orders. The rules in
  // order-rules.ts decide who may cancel from which state.
  fastify.post('/:id/cancel', { schema: cancelOrderDocs }, async (request) => {
    const { id } = request.params as { id: string };
    const body = cancelOrderSchema.parse(request.body);
    return orderService.cancelOrder(id, request.user!.sub, body.reason);
  });
}
