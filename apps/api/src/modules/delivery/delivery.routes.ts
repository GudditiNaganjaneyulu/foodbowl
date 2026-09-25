import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PERMISSIONS,
  assignDeliverySchema,
  deliveredConfirmationSchema,
  rejectAssignmentSchema,
} from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import * as deliveryService from './delivery.service';
import {
  acceptDocs,
  assignDocs,
  deliveredDocs,
  listPartnersDocs,
  myAssignmentsDocs,
  pickedUpDocs,
  rejectDocs,
} from './delivery.docs';

const scopeQuery = z.object({ scope: z.enum(['active', 'history']).default('active') });

export default async function deliveryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);

  // ── Restaurant side (delivery.assign) ────────────────────────────────────
  fastify.get(
    '/partners',
    { schema: listPartnersDocs, preHandler: requirePermission(PERMISSIONS.DELIVERY_ASSIGN) },
    async () => deliveryService.listPartners(),
  );

  fastify.post(
    '/assignments',
    { schema: assignDocs, preHandler: requirePermission(PERMISSIONS.DELIVERY_ASSIGN) },
    async (request, reply) => {
      const body = assignDeliverySchema.parse(request.body);
      return reply.code(201).send(await deliveryService.offerToPartner(request.user!.sub, body));
    },
  );

  // ── Delivery partner side (delivery.fulfill, and it must be *their* assignment) ──
  const asPartner = requirePermission(PERMISSIONS.DELIVERY_FULFILL);

  fastify.get('/me/assignments', { schema: myAssignmentsDocs, preHandler: asPartner }, async (request) => {
    const { scope } = scopeQuery.parse(request.query);
    return deliveryService.listMyAssignments(request.user!.sub, scope);
  });

  fastify.patch('/assignments/:id/accept', { schema: acceptDocs, preHandler: asPartner }, async (request) => {
    const { id } = request.params as { id: string };
    return deliveryService.acceptAssignment(request.user!.sub, id);
  });

  fastify.patch('/assignments/:id/reject', { schema: rejectDocs, preHandler: asPartner }, async (request) => {
    const { id } = request.params as { id: string };
    const body = rejectAssignmentSchema.parse(request.body ?? {});
    return deliveryService.rejectAssignment(request.user!.sub, id, body.reason);
  });

  fastify.patch('/assignments/:id/picked-up', { schema: pickedUpDocs, preHandler: asPartner }, async (request) => {
    const { id } = request.params as { id: string };
    return deliveryService.markPickedUp(request.user!.sub, id);
  });

  fastify.patch('/assignments/:id/delivered', { schema: deliveredDocs, preHandler: asPartner }, async (request) => {
    const { id } = request.params as { id: string };
    const body = deliveredConfirmationSchema.parse(request.body);
    return deliveryService.markDelivered(request.user!.sub, id, body);
  });
}
