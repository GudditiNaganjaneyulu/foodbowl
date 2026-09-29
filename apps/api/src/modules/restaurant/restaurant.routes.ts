import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, updateRestaurantSchema } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import { cached } from '../../lib/cache';
import { RESTAURANT_CACHE_KEY } from '../../lib/cache-keys';
import * as restaurantService from './restaurant.service';
import { getRestaurantDocs, updateRestaurantDocs } from './restaurant.docs';

// A safety net, not the real freshness mechanism — restaurant.service's
// updateRestaurant() invalidates this explicitly on every write, so a change
// shows up immediately. Long-ish TTL because this is read on every
// storefront page load (cart, header, checkout gate) and changes rarely.
const RESTAURANT_CACHE_TTL_SECONDS = 300;

export default async function restaurantRoutes(fastify: FastifyInstance) {
  // Public: the storefront shows name/hours/fee and gates checkout on isOpen.
  fastify.get('/', { schema: getRestaurantDocs }, async () =>
    cached(RESTAURANT_CACHE_KEY, RESTAURANT_CACHE_TTL_SECONDS, async () =>
      restaurantService.toRestaurantDTO(await restaurantService.getRestaurant()),
    ),
  );

  fastify.patch(
    '/',
    { schema: updateRestaurantDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.RESTAURANT_MANAGE)] },
    async (request) => {
      const body = updateRestaurantSchema.parse(request.body);
      return restaurantService.toRestaurantDTO(await restaurantService.updateRestaurant(request.user!.sub, body));
    },
  );
}
