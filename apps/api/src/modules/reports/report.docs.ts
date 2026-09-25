import type { FastifySchema } from 'fastify';
import { PERMISSIONS } from '@foodbowl/shared';
import { bearerAuth, errorResponses, protectedErrors, requiresPermission } from '../../lib/openapi';

const money = (example: string) => ({ type: 'string', description: 'Two-place decimal string.', example });

export const summaryDocs: FastifySchema = {
  tags: ['Reports'],
  summary: 'Dashboard summary',
  description: `Today's orders and revenue, a 7-day trend, what is in progress right now, best sellers, and catalogue counts. **Revenue is cash collected** — the total of delivered orders; cancelled and in-flight orders never count. All days are **UTC** calendar days.\n\n${requiresPermission(PERMISSIONS.REPORTS_VIEW)}`,
  security: bearerAuth,
  response: {
    200: {
      description: 'The summary.',
      type: 'object',
      properties: {
        generatedAt: { type: 'string', format: 'date-time' },
        today: {
          type: 'object',
          properties: {
            ordersPlaced: { type: 'integer' },
            ordersDelivered: { type: 'integer' },
            ordersCancelled: { type: 'integer' },
            revenue: money('33.48'),
          },
        },
        last7Days: {
          type: 'array',
          description: 'Oldest first, always 7 entries.',
          items: {
            type: 'object',
            properties: { date: { type: 'string', example: '2026-09-25' }, ordersPlaced: { type: 'integer' }, revenue: money('120.00') },
          },
        },
        activeByStatus: {
          type: 'array',
          items: { type: 'object', properties: { status: { type: 'string' }, count: { type: 'integer' } } },
        },
        topItems: {
          type: 'array',
          description: 'Best sellers among delivered orders, last 30 days.',
          items: { type: 'object', properties: { name: { type: 'string' }, quantity: { type: 'integer' }, revenue: money('59.90') } },
        },
        menu: { type: 'object', properties: { items: { type: 'integer' }, available: { type: 'integer' } } },
        staff: { type: 'object', properties: { active: { type: 'integer' } } },
      },
    },
    ...errorResponses(protectedErrors),
  },
};
