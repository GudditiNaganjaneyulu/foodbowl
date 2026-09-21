import type { FastifyInstance } from 'fastify';
import { createCategorySchema, createMenuItemSchema, updateMenuItemSchema, PERMISSIONS } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import { prisma } from '../../db/prisma';

export default async function menuRoutes(fastify: FastifyInstance) {
  // Public — no auth required, this is the customer-facing browse endpoint.
  fastify.get('/', async () => {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        menuItems: {
          where: { isAvailable: true },
          orderBy: { sortOrder: 'asc' },
          include: { modifierGroups: { include: { modifiers: true } } },
        },
      },
    });
    return { categories };
  });

  fastify.post(
    '/categories',
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const body = createCategorySchema.parse(request.body);
      const restaurant = await prisma.restaurant.findFirstOrThrow();
      const category = await prisma.category.create({
        data: { ...body, restaurantId: restaurant.id },
      });
      return reply.code(201).send(category);
    },
  );

  fastify.post(
    '/items',
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const body = createMenuItemSchema.parse(request.body);
      const { modifierGroups, ...itemData } = body;
      const item = await prisma.menuItem.create({
        data: {
          ...itemData,
          modifierGroups: {
            create: modifierGroups.map((g) => ({
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              required: g.required,
              modifiers: { create: g.modifiers },
            })),
          },
        },
        include: { modifierGroups: { include: { modifiers: true } } },
      });
      return reply.code(201).send(item);
    },
  );

  fastify.patch(
    '/items/:id',
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateMenuItemSchema.parse(request.body);
      return prisma.menuItem.update({ where: { id }, data: body });
    },
  );

  fastify.delete(
    '/items/:id',
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await prisma.menuItem.delete({ where: { id } });
      return reply.code(204).send();
    },
  );
}
