import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, updateRestaurantSchema } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import * as restaurantService from './restaurant.service';
import { getRestaurantDocs, updateRestaurantDocs } from './restaurant.docs';

export default async function restaurantRoutes(fastify: FastifyInstance) {
  // Public: the storefront shows name/hours/fee and gates checkout on isOpen.
  fastify.get('/', { schema: getRestaurantDocs }, async () =>
    restaurantService.toRestaurantDTO(await restaurantService.getRestaurant()),
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
