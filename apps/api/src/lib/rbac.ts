import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PermissionKey } from '@foodbowl/shared';
import { prisma } from '../db/prisma';
import { HttpError } from './http-error';

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

export interface Actor {
  userId: string;
  /** Role key, read from the database (not the JWT) so role changes apply immediately. */
  role: string;
  permissions: ReadonlySet<string>;
}

/**
 * The acting user for service-layer authorization. Unlike requireAuth (which
 * only verifies the token), this re-reads the user, so a deactivated account
 * or a just-changed role is honoured even while its access token is still
 * inside its 15-minute lifetime.
 */
export async function getActor(userId: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isActive: true, role: { select: { key: true } } },
  });
  if (!user.isActive) throw new HttpError('Account deactivated', 403);
  return { userId, role: user.role.key, permissions: await getEffectivePermissions(userId) };
}
