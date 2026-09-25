import type { FastifyInstance } from 'fastify';
import {
  createCategorySchema,
  createMenuItemSchema,
  modifierGroupSchema,
  updateCategorySchema,
  updateMenuItemSchema,
  PERMISSIONS,
} from '@foodbowl/shared';
import { HttpError } from '../../lib/http-error';
import { moneyStrings } from './menu.dto';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import { prisma } from '../../db/prisma';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import {
  adminMenuDocs,
  createCategoryDocs,
  createMenuItemDocs,
  createModifierGroupDocs,
  deleteMenuItemDocs,
  deleteModifierGroupDocs,
  getMenuDocs,
  updateCategoryDocs,
  updateMenuItemDocs,
} from './menu.docs';

const MENU_CACHE_KEY = 'menu:public';
const MENU_CACHE_TTL_SECONDS = 60;

async function invalidateMenuCache() {
  if (!redis) return;
  try {
    await redis.del(MENU_CACHE_KEY);
  } catch (err) {
    logger.warn({ err }, 'failed to invalidate menu cache — it will self-correct once the TTL expires');
  }
}

export default async function menuRoutes(fastify: FastifyInstance) {
  // Public — no auth required, this is the customer-facing browse endpoint,
  // and the one most worth caching (hit on every storefront page load,
  // rarely changes). Cache-aside: check Redis first, fall through to
  // Postgres on a miss or when Redis isn't configured, repopulate with a
  // short TTL. Every mutating route below invalidates it explicitly too, so
  // edits show up immediately rather than waiting out the TTL.
  fastify.get('/', { schema: getMenuDocs }, async () => {
    if (redis) {
      try {
        const cached = await redis.get(MENU_CACHE_KEY);
        if (cached) return cached;
      } catch (err) {
        logger.warn({ err }, 'menu cache read failed, falling back to the database');
      }
    }

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
    const result = moneyStrings({ categories });

    if (redis) {
      redis.set(MENU_CACHE_KEY, result, { ex: MENU_CACHE_TTL_SECONDS }).catch((err) => {
        logger.warn({ err }, 'menu cache write failed — reads will just keep hitting the database');
      });
    }

    return result;
  });

  // Everything, including hidden categories and unavailable items, for the
  // management screen. Never cached: an editor must see their own change at once.
  fastify.get(
    '/admin',
    { schema: adminMenuDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async () => {
      const categories = await prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          menuItems: {
            orderBy: { sortOrder: 'asc' },
            include: { modifierGroups: { include: { modifiers: true } } },
          },
        },
      });
      return moneyStrings({ categories });
    },
  );

  fastify.patch(
    '/categories/:id',
    { schema: updateCategoryDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateCategorySchema.parse(request.body);
      const category = await prisma.category.update({ where: { id }, data: body });
      await invalidateMenuCache();
      return category;
    },
  );

  fastify.post(
    '/categories',
    { schema: createCategoryDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const body = createCategorySchema.parse(request.body);
      const restaurant = await prisma.restaurant.findFirstOrThrow();
      const category = await prisma.category.create({
        data: { ...body, restaurantId: restaurant.id },
      });
      await invalidateMenuCache();
      return reply.code(201).send(category);
    },
  );

  fastify.post(
    '/items',
    { schema: createMenuItemDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const body = createMenuItemSchema.parse(request.body);
      const { modifierGroups, ...itemData } = body;
      if (!(await prisma.category.findUnique({ where: { id: itemData.categoryId }, select: { id: true } }))) {
        throw new HttpError('Unknown category', 400);
      }
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
      await invalidateMenuCache();
      return reply.code(201).send(moneyStrings(item));
    },
  );

  fastify.patch(
    '/items/:id',
    { schema: updateMenuItemDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateMenuItemSchema.parse(request.body);
      const item = await prisma.menuItem.update({ where: { id }, data: body });
      await invalidateMenuCache();
      return moneyStrings(item);
    },
  );

  fastify.delete(
    '/items/:id',
    { schema: deleteMenuItemDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ordered = await prisma.orderItem.count({ where: { menuItemId: id } });
      if (ordered > 0) {
        throw new HttpError('This item appears in past orders and cannot be deleted — mark it unavailable instead', 409);
      }
      // Carts are transient; drop the item from anyone's cart rather than blocking on it.
      await prisma.$transaction([
        prisma.cartItem.deleteMany({ where: { menuItemId: id } }),
        prisma.menuItem.delete({ where: { id } }),
      ]);
      await invalidateMenuCache();
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/items/:id/modifier-groups',
    { schema: createModifierGroupDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { modifiers, ...group } = modifierGroupSchema.parse(request.body);
      await prisma.menuItem.findUniqueOrThrow({ where: { id }, select: { id: true } });
      const created = await prisma.modifierGroup.create({
        data: { ...group, menuItemId: id, modifiers: { create: modifiers } },
        include: { modifiers: true },
      });
      await invalidateMenuCache();
      return reply.code(201).send(moneyStrings(created));
    },
  );

  fastify.delete(
    '/modifier-groups/:id',
    { schema: deleteModifierGroupDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      // Cart lines that chose one of this group's options would become
      // unpriceable; they're flagged unavailable (see cart pricing) and the
      // customer can remove them. Past orders keep their own snapshot.
      await prisma.modifierGroup.delete({ where: { id } });
      await invalidateMenuCache();
      return reply.code(204).send();
    },
  );
}
