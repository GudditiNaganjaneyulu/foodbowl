import type { FastifyInstance } from 'fastify';
import { createCategorySchema, createMenuItemSchema, updateMenuItemSchema, PERMISSIONS } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import { prisma } from '../../db/prisma';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';

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
  fastify.get('/', async () => {
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
    const result = { categories };

    if (redis) {
      redis.set(MENU_CACHE_KEY, result, { ex: MENU_CACHE_TTL_SECONDS }).catch((err) => {
        logger.warn({ err }, 'menu cache write failed — reads will just keep hitting the database');
      });
    }

    return result;
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
      await invalidateMenuCache();
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
      await invalidateMenuCache();
      return reply.code(201).send(item);
    },
  );

  fastify.patch(
    '/items/:id',
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateMenuItemSchema.parse(request.body);
      const item = await prisma.menuItem.update({ where: { id }, data: body });
      await invalidateMenuCache();
      return item;
    },
  );

  fastify.delete(
    '/items/:id',
    { preHandler: [requireAuth, requirePermission(PERMISSIONS.MENU_MANAGE)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await prisma.menuItem.delete({ where: { id } });
      await invalidateMenuCache();
      return reply.code(204).send();
    },
  );
}
