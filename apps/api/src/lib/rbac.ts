import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PermissionKey } from '@foodbowl/shared';
import { prisma } from '../db/prisma';

/**
 * Resolves a user's effective permission set: role defaults (RolePermission)
 * overlaid with per-user overrides (UserPermission). This is the ONLY place
 * that should compute effective permissions — routes call requirePermission()
 * below rather than re-deriving this.
 */
export async function getEffectivePermissions(userId: string): Promise<Set<PermissionKey>> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
      userPermissions: { include: { permission: true } },
    },
  });

  const effective = new Set<PermissionKey>(
    user.role.rolePermissions.map((rp) => rp.permission.key as PermissionKey),
  );

  for (const override of user.userPermissions) {
    const key = override.permission.key as PermissionKey;
    if (override.granted) effective.add(key);
    else effective.delete(key);
  }

  return effective;
}

/**
 * Fastify preHandler factory. Requires requireAuth to have already run and
 * populated request.user. Re-checks permissions server-side on every request
 * — the frontend's usePermissions() hook is UX only, never a security boundary.
 */
export function requirePermission(permission: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const permissions = await getEffectivePermissions(request.user.sub);
    if (!permissions.has(permission)) {
      return reply.code(403).send({ error: `Missing permission: ${permission}` });
    }
  };
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden for this role' });
    }
  };
}
