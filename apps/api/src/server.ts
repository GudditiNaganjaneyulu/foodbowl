import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { env } from './config/env';
import { logger } from './lib/logger';
import authPlugin from './plugins/auth';
import errorHandlerPlugin from './plugins/error-handler';
import authRoutes from './modules/auth/auth.routes';
import adminUsersRoutes from './modules/users/admin-users.routes';
import profileRoutes from './modules/users/profile.routes';
import menuRoutes from './modules/menu/menu.routes';
import healthRoutes from './modules/health/health.routes';

const fastify = Fastify({ loggerInstance: logger as never });

await fastify.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
await fastify.register(cookie);
await fastify.register(authPlugin);
await fastify.register(errorHandlerPlugin);

await fastify.register(healthRoutes);
await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
await fastify.register(adminUsersRoutes, { prefix: '/api/v1/admin/users' });
await fastify.register(profileRoutes, { prefix: '/api/v1/users' });
await fastify.register(menuRoutes, { prefix: '/api/v1/menu' });

fastify
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => logger.info({ port: env.PORT }, `foodbowl-api listening`))
  .catch((err) => {
    logger.error(err, 'failed to start server');
    process.exit(1);
  });
