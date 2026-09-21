import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type AccessTokenClaims } from '../lib/tokens';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessTokenClaims;
  }
}

/**
 * Decorates every request with `.user` when a valid Bearer access token is
 * present, but does NOT reject unauthenticated requests itself — routes that
 * need auth chain `requireAuth` (below) as a preHandler explicitly, so public
 * routes (menu browsing) stay public.
 */
export default fp(async (fastify) => {
  fastify.decorateRequest('user', undefined);

  fastify.addHook('preHandler', async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    try {
      request.user = await verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      // invalid/expired token — leave request.user undefined, requireAuth will 401
    }
  });
});

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}
