import type { FastifyInstance } from 'fastify';
import {
  createUserSchema,
  updateUserPermissionsSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  PERMISSIONS,
} from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import * as adminUsers from './admin-users.service';

/**
 * The ONLY path for creating/deactivating/role-assigning non-customer users
 * (see BUILD_PROMPT.md §3.4) — no separate CLI/script. Mounted under
 * /api/v1/admin/users, every route gated on `users.manage`, owner-only by
 * default (see DEFAULT_ROLE_PERMISSIONS in packages/shared).
 */
export default async function adminUsersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);
  fastify.addHook('preHandler', requirePermission(PERMISSIONS.USERS_MANAGE));

  fastify.get('/', async (request) => {
    const query = request.query as { role?: string; isActive?: string };
    return adminUsers.listUsers({
      role: query.role,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
    });
  });

  fastify.post('/', async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const user = await adminUsers.createUser(request.user!.sub, body);
    return reply.code(201).send(user);
  });

  fastify.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const body = updateUserStatusSchema.parse(request.body);
    return adminUsers.setUserStatus(request.user!.sub, id, body.isActive);
  });

  fastify.patch('/:id/role', async (request) => {
    const { id } = request.params as { id: string };
    const body = updateUserRoleSchema.parse(request.body);
    return adminUsers.setUserRole(request.user!.sub, id, body.role);
  });

  fastify.patch('/:id/permissions', async (request) => {
    const { id } = request.params as { id: string };
    const body = updateUserPermissionsSchema.parse(request.body);
    await adminUsers.setUserPermissions(request.user!.sub, id, body);
    return { ok: true };
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await adminUsers.deleteUser(request.user!.sub, id);
    return reply.code(204).send();
  });
}
