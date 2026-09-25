import type { PrismaClient } from '@prisma/client';

/**
 * Integration suites leave notifications and audit rows behind (every order
 * event writes some). Delete whatever was created since the suite started so
 * repeated runs don't grow the test database.
 */
export async function deleteSince(prisma: PrismaClient, since: Date) {
  await prisma.notification.deleteMany({ where: { createdAt: { gte: since } } });
  await prisma.auditLog.deleteMany({ where: { createdAt: { gte: since } } });
}

/**
 * Suites that place orders must not inherit whatever state a previous run (or
 * a person poking at the test database) left behind: force the restaurant to
 * its baseline settings and make sure the seeded menu is orderable.
 */
export async function resetBaseline(prisma: PrismaClient) {
  await prisma.restaurant.updateMany({ data: { isOpen: true, deliveryFee: 2.5, minOrderAmount: 5 } });
  await prisma.menuItem.updateMany({ where: { id: { startsWith: 'seed-item-' } }, data: { isAvailable: true } });
  await prisma.category.updateMany({ where: { id: { startsWith: 'seed-cat-' } }, data: { isActive: true } });
}
