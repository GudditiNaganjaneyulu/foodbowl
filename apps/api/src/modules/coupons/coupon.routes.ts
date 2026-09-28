import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import * as couponService from './coupon.service';
import { listMyCouponsDocs } from './coupon.docs';

export default async function couponRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/me', { schema: listMyCouponsDocs }, async (request) => couponService.listMyCoupons(request.user!.sub));
}
