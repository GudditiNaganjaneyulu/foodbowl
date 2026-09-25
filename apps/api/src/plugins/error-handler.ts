import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export default fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Validation failed', details: error.flatten() });
    }

    // Unknown ids etc. used to surface as a generic 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'Record not found' });
      if (error.code === 'P2002') return reply.code(409).send({ error: 'A record with these values already exists' });
      if (error.code === 'P2003') return reply.code(409).send({ error: 'This record is still referenced by other data' });
    }
    // Neon's free tier suspends idle compute; the first query after a pause
    // fails to connect. Tell clients it's transient rather than a 500.
    if (error instanceof Prisma.PrismaClientInitializationError) {
      logger.warn({ url: request.url }, 'database unreachable (cold start?)');
      return reply
        .code(503)
        .header('Retry-After', '3')
        .send({ error: 'Database is waking up — please retry in a few seconds' });
    }

    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error({ err, url: request.url }, 'unhandled error');
    }
    return reply.code(statusCode).send({ error: err.message || 'Internal server error' });
  });
});
