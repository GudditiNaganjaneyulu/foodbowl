import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, ALL_ROLES, DEFAULT_ROLE_PERMISSIONS } from '@foodbowl/shared';

/**
 * Makes the roles, permissions and role→permission defaults in the database
 * match packages/shared (the source of truth). Idempotent and additive: it
 * only creates what's missing, never removes or overrides per-user grants.
 *
 * Used by the seed AND by `pnpm db:sync-rbac`, which deployments run after
 * migrations — so a newly introduced permission (e.g. support.manage) reaches
 * an existing production database without loading any demo data.
 */
export async function syncRbac(prisma: PrismaClient) {
  const roles = new Map<string, string>();
  for (const key of ALL_ROLES) {
    const role = await prisma.role.upsert({ where: { key }, update: {}, create: { key, name: key.replace(/_/g, ' ') } });
    roles.set(key, role.id);
  }

  const permissions = new Map<string, string>();
  for (const key of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, description: key } });
    permissions.set(key, permission.id);
  }

  for (const [roleKey, permissionKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleId = roles.get(roleKey)!;
    for (const permissionKey of permissionKeys) {
      const permissionId = permissions.get(permissionKey)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }
  return { roles, permissions };
}
