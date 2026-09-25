import { PrismaClient } from '@prisma/client';
import { syncRbac } from './rbac';

const prisma = new PrismaClient();

syncRbac(prisma)
  .then(({ roles, permissions }) => console.log(`RBAC in sync: ${roles.size} roles, ${permissions.size} permissions`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
