import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export default fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Validation failed', details: error.flatten() });
    }

    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error({ err, url: request.url }, 'unhandled error');
    }
    return reply.code(statusCode).send({ error: err.message || 'Internal server error' });
  });
});
