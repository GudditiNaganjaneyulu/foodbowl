import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error';
import { requireAuth } from '../../plugins/auth';
import * as notificationService from './notification.service';
import { listNotificationsDocs, markAllReadDocs, markReadDocs } from './notification.docs';

const listQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/me', { schema: listNotificationsDocs }, async (request) => {
    const q = listQuery.parse(request.query);
    return notificationService.listMine(request.user!.sub, { unreadOnly: q.unread === 'true', limit: q.limit });
  });

  // Registered before '/:id/read' so "read-all" is never read as an id.
  fastify.post('/read-all', { schema: markAllReadDocs }, async (request) => ({
    ok: true,
    updated: await notificationService.markAllRead(request.user!.sub),
  }));

  fastify.patch('/:id/read', { schema: markReadDocs }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await notificationService.markRead(request.user!.sub, id);
    if (!updated) throw new HttpError('Notification not found', 404);
    return updated;
  });
}
