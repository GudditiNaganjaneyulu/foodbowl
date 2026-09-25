import type { FastifySchema } from 'fastify';
import { bearerAuth, errorResponses, idParam, ref } from '../../lib/openapi';

const unauthorized = { 401: 'Missing, invalid or expired access token.' } as const;

export const listNotificationsDocs: FastifySchema = {
  tags: ['Notifications'],
  summary: 'My notifications',
  description:
    'In-app notifications, newest first, with the total unread count (for a bell badge). New ones also arrive live as `notification:new` on the Socket.IO connection. Emails, when enabled, are sent in addition and are not listed here.',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      unread: { type: 'string', enum: ['true', 'false'], description: 'Only unread notifications.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
    },
  },
  response: {
    200: {
      description: 'Notifications and unread count.',
      type: 'object',
      properties: {
        items: { type: 'array', items: ref('Notification') },
        unreadCount: { type: 'integer', example: 3 },
      },
    },
    ...errorResponses({ 400: 'Invalid query.', ...unauthorized }),
  },
};

export const markReadDocs: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Mark one notification as read',
  security: bearerAuth,
  params: idParam,
  response: {
    200: { description: 'The updated notification.', ...ref('Notification') },
    ...errorResponses({ ...unauthorized, 404: 'No such notification (or it is not yours).' }),
  },
};

export const markAllReadDocs: FastifySchema = {
  tags: ['Notifications'],
  summary: 'Mark all my notifications as read',
  security: bearerAuth,
  response: {
    200: {
      description: 'How many were updated.',
      type: 'object',
      properties: { ok: { type: 'boolean', example: true }, updated: { type: 'integer', example: 4 } },
    },
    ...errorResponses(unauthorized),
  },
};
