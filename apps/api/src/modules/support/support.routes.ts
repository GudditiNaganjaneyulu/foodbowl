import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PERMISSIONS,
  assignTicketSchema,
  createTicketSchema,
  postMessageSchema,
  updateTicketStatusSchema,
} from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { getActor, requirePermission } from '../../lib/rbac';
import * as supportService from './support.service';
import {
  assignDocs,
  createTicketDocs,
  getTicketDocs,
  listAgentsDocs,
  listMineDocs,
  listTicketsDocs,
  postMessageDocs,
  setStatusDocs,
  summaryDocs,
} from './support.docs';

const staffListQuery = z.object({
  view: z.enum(['open', 'mine', 'unassigned', 'resolved', 'all']).optional(),
  q: z.string().max(100).optional(),
});

/**
 * Customer support conversations. Customers see only their own; anyone with
 * `support.manage` (the owner, and staff the owner has granted it to) can see,
 * answer, assign and resolve all of them. Access to a single conversation is
 * decided in the service (requester or support staff, else 404).
 */
export default async function supportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);
  const asStaff = requirePermission(PERMISSIONS.SUPPORT_MANAGE);

  // ── Customer ──────────────────────────────────────────────────────────
  fastify.post('/tickets', { schema: createTicketDocs }, async (request, reply) => {
    const body = createTicketSchema.parse(request.body);
    return reply.code(201).send(await supportService.createTicket(request.user!.sub, body));
  });

  fastify.get('/tickets/me', { schema: listMineDocs }, async (request) => supportService.listMine(request.user!.sub));

  // ── Support staff ─────────────────────────────────────────────────────
  fastify.get('/tickets', { schema: listTicketsDocs, preHandler: asStaff }, async (request) => {
    const query = staffListQuery.parse(request.query);
    const actor = await getActor(request.user!.sub);
    return supportService.listForStaff(actor, { view: query.view, search: query.q });
  });

  fastify.get('/summary', { schema: summaryDocs, preHandler: asStaff }, async (request) =>
    supportService.getSummary(await getActor(request.user!.sub)),
  );

  fastify.get('/agents', { schema: listAgentsDocs, preHandler: asStaff }, async () => supportService.listAgents());

  // ── Shared (customer or support staff; the service enforces who) ───────
  fastify.get('/tickets/:id', { schema: getTicketDocs }, async (request) => {
    const { id } = request.params as { id: string };
    return supportService.getTicket(id, request.user!.sub);
  });

  fastify.post('/tickets/:id/messages', { schema: postMessageDocs }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = postMessageSchema.parse(request.body);
    return reply.code(201).send(await supportService.postMessage(id, request.user!.sub, body));
  });

  fastify.patch('/tickets/:id/status', { schema: setStatusDocs }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateTicketStatusSchema.parse(request.body);
    return supportService.setStatus(id, request.user!.sub, body.status);
  });

  fastify.patch('/tickets/:id/assign', { schema: assignDocs, preHandler: asStaff }, async (request) => {
    const { id } = request.params as { id: string };
    const body = assignTicketSchema.parse(request.body);
    return supportService.assign(id, request.user!.sub, body);
  });
}
