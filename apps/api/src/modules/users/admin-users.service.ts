import argon2 from 'argon2';
import {
  OWNER_ONLY_PERMISSIONS,
  ROLES,
  type CreateUserInput,
  type UpdateUserPermissionsInput,
} from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';

export class AdminUserError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

async function writeAudit(actorUserId: string, action: string, targetUserId: string, metadata: unknown) {
  await prisma.auditLog.create({
    data: { actorUserId, action, entityType: 'User', entityId: targetUserId, metadata: metadata as never },
  });
}

export async function listUsers(filter: { role?: string; isActive?: boolean }) {
  return prisma.user.findMany({
    where: {
      role: filter.role ? { key: filter.role } : undefined,
      isActive: filter.isActive,
    },
    omit: { passwordHash: true },
    include: { role: true, userPermissions: { include: { permission: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createUser(actorUserId: string, input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AdminUserError('Email already in use', 409);

  const role = await prisma.role.findUnique({ where: { key: input.role } });
  if (!role) throw new AdminUserError('Unknown role', 400);

  const passwordHash = await argon2.hash(input.temporaryPassword);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, phone: input.phone, passwordHash, roleId: role.id },
    omit: { passwordHash: true },
    include: { role: true },
  });

  await writeAudit(actorUserId, 'user.create', user.id, { role: input.role });
  logger.info({ actorUserId, targetUserId: user.id, role: input.role }, 'admin created user');
  return user;
}

export async function setUserStatus(actorUserId: string, targetUserId: string, isActive: boolean) {
  if (actorUserId === targetUserId && !isActive) {
    throw new AdminUserError('You cannot deactivate your own account', 400);
  }
  const user = await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive, permVersion: { increment: 1 } },
    omit: { passwordHash: true },
  });
  // Deactivation must immediately kill live sessions, not just block future logins.
  if (!isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await writeAudit(actorUserId, isActive ? 'user.activate' : 'user.deactivate', targetUserId, {});
  return user;
}

export async function setUserRole(actorUserId: string, targetUserId: string, roleKey: string) {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new AdminUserError('Unknown role', 400);

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { roleId: role.id, permVersion: { increment: 1 } },
      omit: { passwordHash: true },
    }),
    // Role change resets per-user overrides — they applied to the old role's baseline.
    prisma.userPermission.deleteMany({ where: { userId: targetUserId } }),
  ]);

  await writeAudit(actorUserId, 'user.role_change', targetUserId, { newRole: roleKey });
  return user;
}

export async function setUserPermissions(
  actorUserId: string,
  targetUserId: string,
  input: UpdateUserPermissionsInput,
) {
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    include: { role: true },
  });
  if (target.role.key !== ROLES.STAFF) {
    throw new AdminUserError('Per-user permission overrides only apply to staff accounts', 400);
  }
  for (const grant of input.grants) {
    if (grant.granted && (OWNER_ONLY_PERMISSIONS as string[]).includes(grant.permission)) {
      throw new AdminUserError(`${grant.permission} cannot be granted to staff`, 403);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const grant of input.grants) {
      const permission = await tx.permission.findUniqueOrThrow({ where: { key: grant.permission } });
      await tx.userPermission.upsert({
        where: { userId_permissionId: { userId: targetUserId, permissionId: permission.id } },
        create: { userId: targetUserId, permissionId: permission.id, granted: grant.granted },
        update: { granted: grant.granted },
      });
    }
    await tx.user.update({ where: { id: targetUserId }, data: { permVersion: { increment: 1 } } });
  });

  await writeAudit(actorUserId, 'user.permissions_change', targetUserId, input.grants);
}

async function hasProtectedHistory(userId: string): Promise<boolean> {
  const [orderCount, assignmentCount, auditCount] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.deliveryAssignment.count({
      where: { OR: [{ deliveryPartnerId: userId }, { assignedByUserId: userId }] },
    }),
    prisma.auditLog.count({ where: { actorUserId: userId } }),
  ]);
  return orderCount + assignmentCount + auditCount > 0;
}

export async function deleteUser(actorUserId: string, targetUserId: string) {
  if (await hasProtectedHistory(targetUserId)) {
    throw new AdminUserError(
      'This user has historical orders/assignments/audit records — deactivate instead of deleting',
      409,
    );
  }
  await prisma.user.delete({ where: { id: targetUserId } });
  await writeAudit(actorUserId, 'user.delete', targetUserId, {});
}

// The email prefix scripts/rate-limit-check.ts uses for the accounts it
// creates while flooding POST /register. Hardcoded (not caller-supplied) on
// purpose — this endpoint only ever removes accounts matching this exact,
// known-safe pattern, never an arbitrary filter, and only customer accounts
// (role check below), so it can't become a general bulk-delete tool.
const TEST_ACCOUNT_EMAIL_PREFIX = 'ratelimit-test-';

export async function deleteTestAccounts(actorUserId: string) {
  const candidates = await prisma.user.findMany({
    where: { email: { startsWith: TEST_ACCOUNT_EMAIL_PREFIX }, role: { key: ROLES.CUSTOMER } },
    select: { id: true, email: true },
  });

  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const candidate of candidates) {
    // Should never trip for a fresh flood-test signup, but the same
    // deactivate-instead-of-delete safety net as deleteUser applies here too.
    if (await hasProtectedHistory(candidate.id)) {
      skipped.push(candidate.email);
      continue;
    }
    await prisma.user.delete({ where: { id: candidate.id } });
    await writeAudit(actorUserId, 'user.delete_test_account', candidate.id, { email: candidate.email });
    deleted.push(candidate.email);
  }

  return { deletedCount: deleted.length, deleted, skippedCount: skipped.length, skipped };
}
