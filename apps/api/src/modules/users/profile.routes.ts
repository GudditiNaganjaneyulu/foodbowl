import type { FastifyInstance } from 'fastify';
import { addressSchema, changePasswordSchema, updateAddressSchema, updateProfileSchema } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { rateLimit } from '../../lib/rate-limit';
import * as profileService from './profile.service';
import * as addressService from './address.service';
import {
  changePasswordDocs,
  createAddressDocs,
  deleteAddressDocs,
  getMeDocs,
  listAddressesDocs,
  updateAddressDocs,
  updateMeDocs,
} from './profile.docs';

/**
 * Self-service account actions for the logged-in user (any role) — as
 * opposed to modules/users/admin-users.* which is the owner-only "manage
 * other people's accounts" surface.
 */
export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/me', { schema: getMeDocs }, async (request) => profileService.getMe(request.user!.sub));

  fastify.patch('/me', { schema: updateMeDocs }, async (request) => {
    const body = updateProfileSchema.parse(request.body);
    return profileService.updateMe(request.user!.sub, body);
  });

  fastify.get('/me/addresses', { schema: listAddressesDocs }, async (request) =>
    addressService.listAddresses(request.user!.sub),
  );

  fastify.post('/me/addresses', { schema: createAddressDocs }, async (request, reply) => {
    const body = addressSchema.parse(request.body);
    return reply.code(201).send(await addressService.createAddress(request.user!.sub, body));
  });

  fastify.patch('/me/addresses/:id', { schema: updateAddressDocs }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateAddressSchema.parse(request.body);
    return addressService.updateAddress(request.user!.sub, id, body);
  });

  fastify.delete('/me/addresses/:id', { schema: deleteAddressDocs }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await addressService.deleteAddress(request.user!.sub, id);
    return reply.code(204).send();
  });

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
