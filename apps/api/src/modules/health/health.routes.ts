import type { FastifyInstance } from 'fastify';
import { healthDocs, readinessDocs } from './health.docs';
import { prisma } from '../../db/prisma';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', { schema: healthDocs }, async () => ({ status: 'ok' }));

  fastify.get('/health/ready', { schema: readinessDocs }, async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'connected' };
    } catch {
      return reply.code(503).send({ status: 'not ready', db: 'disconnected' });
    }
  });
}
