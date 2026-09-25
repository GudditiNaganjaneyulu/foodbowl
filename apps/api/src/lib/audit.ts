import { prisma } from '../db/prisma';

export async function writeAudit(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: unknown = {},
) {
  await prisma.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata: metadata as never },
  });
}
