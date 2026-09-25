import fp from 'fastify-plugin';
import { Server, type Socket } from 'socket.io';
import { PERMISSIONS, REALTIME } from '@foodbowl/shared';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { setRealtimeServer } from '../lib/realtime';
import { getActor } from '../lib/rbac';
import { verifyAccessToken } from '../lib/tokens';
import { canViewOrder } from '../modules/orders/order-rules';

/**
 * Socket.IO on the same HTTP server, namespace `/orders` (BUILD_PROMPT.md §5).
 * Clients authenticate with their access token in the handshake, are put in
 * their private `user:{id}` room automatically, and may then ask to join
 * `order:{id}` (if allowed to see that order) or the staff `restaurant:orders`
 * queue (needs orders.view). Access is re-checked at join time against the
 * database, never trusted from the client.
 */
export default fp(async (fastify) => {
  const io = new Server(fastify.server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });
  const namespace = io.of(REALTIME.NAMESPACE);

  namespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const claims = await verifyAccessToken(token);
      socket.data.userId = claims.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  namespace.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    void socket.join(REALTIME.rooms.user(userId));

    type Ack = (result: { ok: boolean; error?: string }) => void;
    const reply = (ack: unknown, result: { ok: boolean; error?: string }) => {
      if (typeof ack === 'function') (ack as Ack)(result);
    };

    socket.on(REALTIME.ACTIONS.JOIN_QUEUE, async (ack?: Ack) => {
      try {
        const actor = await getActor(userId);
        if (!actor.permissions.has(PERMISSIONS.ORDERS_VIEW)) return reply(ack, { ok: false, error: 'forbidden' });
        await socket.join(REALTIME.rooms.queue);
        reply(ack, { ok: true });
      } catch {
        reply(ack, { ok: false, error: 'forbidden' });
      }
    });

    socket.on(REALTIME.ACTIONS.JOIN_ORDER, async (orderId: unknown, ack?: Ack) => {
      try {
        if (typeof orderId !== 'string') return reply(ack, { ok: false, error: 'bad request' });
        const [actor, order] = await Promise.all([
          getActor(userId),
          prisma.order.findUnique({
            where: { id: orderId },
            select: { userId: true, deliveryAssignment: { select: { deliveryPartnerId: true } } },
          }),
        ]);
        const allowed =
          order &&
          canViewOrder(actor, {
            customerId: order.userId,
            assignedPartnerId: order.deliveryAssignment?.deliveryPartnerId ?? null,
          });
        if (!allowed) return reply(ack, { ok: false, error: 'not found' });
        await socket.join(REALTIME.rooms.order(orderId));
        reply(ack, { ok: true });
      } catch {
        reply(ack, { ok: false, error: 'not found' });
      }
    });

    socket.on(REALTIME.ACTIONS.LEAVE_ORDER, (orderId: unknown) => {
      if (typeof orderId === 'string') void socket.leave(REALTIME.rooms.order(orderId));
    });
  });

  setRealtimeServer(io);
  logger.info('socket.io attached on namespace /orders');

  fastify.addHook('onClose', async () => {
    setRealtimeServer(null);
    // engine.close() drops connections without closing the HTTP server,
    // which Fastify closes itself.
    io.engine.close();
  });
});
