import type { FastifyInstance } from 'fastify';
import { addCartItemSchema, updateCartItemSchema } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import * as cartService from './cart.service';
import {
  addCartItemDocs,
  clearCartDocs,
  getCartDocs,
  removeCartItemDocs,
  updateCartItemDocs,
} from './cart.docs';

/** One active cart per user, persisted server-side so it follows them across devices. */
export default async function cartRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', { schema: getCartDocs }, async (request) => cartService.getCart(request.user!.sub));

  fastify.post('/items', { schema: addCartItemDocs }, async (request) => {
    const body = addCartItemSchema.parse(request.body);
    return cartService.addItem(request.user!.sub, body);
  });

  fastify.patch('/items/:id', { schema: updateCartItemDocs }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateCartItemSchema.parse(request.body);
    return cartService.updateItem(request.user!.sub, id, body);
  });

  fastify.delete('/items/:id', { schema: removeCartItemDocs }, async (request) => {
    const { id } = request.params as { id: string };
    return cartService.removeItem(request.user!.sub, id);
  });

  fastify.delete('/', { schema: clearCartDocs }, async (request) => cartService.clearCart(request.user!.sub));
}
