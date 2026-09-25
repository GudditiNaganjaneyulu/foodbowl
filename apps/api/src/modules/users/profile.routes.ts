import type { FastifyInstance } from 'fastify';
import { changePasswordSchema } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { rateLimit } from '../../lib/rate-limit';
import * as profileService from './profile.service';
import { changePasswordDocs } from './profile.docs';

/**
 * Self-service account actions for the logged-in user (any role) — as
 * opposed to modules/users/admin-users.* which is the owner-only "manage
 * other people's accounts" surface.
 */
export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);

  fastify.patch(
    '/me/password',
    // A stolen access token still needs the current password to actually
    // change it — rate-limited so that can't be brute-forced either.
    { schema: changePasswordDocs, preHandler: rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'change-password' }) },
    async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);
      await profileService.changePassword(request.user!.sub, body);
      return reply.send({ ok: true });
    },
  );
}
