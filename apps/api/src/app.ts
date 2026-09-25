import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { env } from './config/env';
import { logger } from './lib/logger';
import authPlugin from './plugins/auth';
import errorHandlerPlugin from './plugins/error-handler';
import swaggerPlugin from './plugins/swagger';
import realtimePlugin from './plugins/realtime';
import authRoutes from './modules/auth/auth.routes';
import adminUsersRoutes from './modules/users/admin-users.routes';
import profileRoutes from './modules/users/profile.routes';
import menuRoutes from './modules/menu/menu.routes';
import healthRoutes from './modules/health/health.routes';
import restaurantRoutes from './modules/restaurant/restaurant.routes';
import cartRoutes from './modules/cart/cart.routes';
import orderRoutes from './modules/orders/order.routes';
import deliveryRoutes from './modules/delivery/delivery.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import uploadRoutes from './modules/uploads/upload.routes';
import reportRoutes from './modules/reports/report.routes';
import fileRoutes from './modules/uploads/files.routes';
import { MAX_UPLOAD_BYTES } from '@foodbowl/shared';

/**
 * Builds the fully-wired Fastify app without listening — so tests can drive it
 * with `app.inject()` (or listen on an ephemeral port), and server.ts stays a
 * thin entrypoint. Tracing is NOT imported here: server.ts must load it first.
 */
export async function buildApp() {
  const fastify = Fastify({ loggerInstance: logger as never });

  // Fastify rejects `Content-Type: application/json` with an empty body (400),
  // which trips up body-less POSTs such as /auth/refresh and /auth/logout from
  // clients that send the header anyway. Treat empty as "no body"; genuinely
  // malformed JSON is still a 400.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(Object.assign(new Error('Request body is not valid JSON'), { statusCode: 400 }), undefined);
    }
  });

  // Image bodies (uploads to built-in storage) arrive as raw bytes.
  fastify.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp'],
    { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
    (_request, body, done) => done(null, body),
  );

  await fastify.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await fastify.register(cookie);
  await fastify.register(authPlugin);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(realtimePlugin);
  // Must come before any route is registered so the OpenAPI spec sees them all.
  await fastify.register(swaggerPlugin);

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(adminUsersRoutes, { prefix: '/api/v1/admin/users' });
  await fastify.register(profileRoutes, { prefix: '/api/v1/users' });
  await fastify.register(menuRoutes, { prefix: '/api/v1/menu' });
  await fastify.register(restaurantRoutes, { prefix: '/api/v1/restaurant' });
  await fastify.register(cartRoutes, { prefix: '/api/v1/cart' });
  await fastify.register(orderRoutes, { prefix: '/api/v1/orders' });
  await fastify.register(deliveryRoutes, { prefix: '/api/v1/delivery' });
  await fastify.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await fastify.register(uploadRoutes, { prefix: '/api/v1/uploads' });
  await fastify.register(reportRoutes, { prefix: '/api/v1/admin/reports' });
  await fastify.register(fileRoutes, { prefix: '/files' });

  return fastify;
}
