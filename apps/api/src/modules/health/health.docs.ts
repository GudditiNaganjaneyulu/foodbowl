import type { FastifySchema } from 'fastify';
import { ref } from '../../lib/openapi';

export const healthDocs: FastifySchema = {
  tags: ['Health'],
  summary: 'Liveness check',
  description: 'Returns `{ "status": "ok" }` while the process is up. Does not check the database.',
  response: {
    200: { description: 'Service is up.', ...ref('HealthResponse') },
  },
};

export const readinessDocs: FastifySchema = {
  tags: ['Health'],
  summary: 'Readiness check',
  description:
    'Runs `SELECT 1` against the database. Use this (not `/health`) for load-balancer or orchestrator readiness probes.',
  response: {
    200: {
      description: 'Service and database are reachable.',
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ready' },
        db: { type: 'string', example: 'connected' },
      },
    },
    503: {
      description: 'The database is unreachable.',
      type: 'object',
      properties: {
        status: { type: 'string', example: 'not ready' },
        db: { type: 'string', example: 'disconnected' },
      },
    },
  },
};
