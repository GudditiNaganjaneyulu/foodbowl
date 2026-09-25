import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { DEFAULT_ROLE_PERMISSIONS, OWNER_ONLY_PERMISSIONS } from '@foodbowl/shared';
import { componentSchemas } from '../lib/openapi-components';

const REFRESH_COOKIE = 'foodbowl_refresh_token';

const rolesTable = [
  '| Role | Default permissions |',
  '|---|---|',
  ...Object.entries(DEFAULT_ROLE_PERMISSIONS).map(
    ([role, permissions]) => `| \`${role}\` | ${permissions.length ? permissions.map((p) => `\`${p}\``).join(', ') : '—'} |`,
  ),
].join('\n');

const description = `
REST API for FoodBowl, a single-restaurant food ordering platform. All routes
are under \`/api/v1\` except \`/health\`.

## Authentication

1. \`POST /api/v1/auth/login\` (or \`/register\` for customers) returns a short-lived
   **access token** in the body and sets an httpOnly **refresh cookie**.
2. Send the access token on protected routes as \`Authorization: Bearer <token>\`.
   In this UI, click **Authorize** and paste the token.
3. When it expires, \`POST /api/v1/auth/refresh\` exchanges the refresh cookie for a new
   access token. The refresh token is **rotated** on every use.

## Roles and permissions

Access is permission-based (RBAC). Each role has default permissions; the owner can
grant or revoke individual permissions for **staff** accounts. Permissions are always
re-checked server-side on every request.

${rolesTable}

Owner-only permissions that can never be granted to staff: ${OWNER_ONLY_PERMISSIONS.map((p) => `\`${p}\``).join(', ')}.

## Errors

Errors are JSON: \`{ "error": "message" }\`. Request-body validation failures return **400**
with \`{ "error": "Validation failed", "details": { "formErrors": [], "fieldErrors": {} } }\`.

## Rate limiting

\`register\`, \`login\` and \`change password\` are rate-limited per client IP and return **429**
when exceeded. Limiting is active only when Redis (Upstash) is configured.
`.trim();

export default fp(async (fastify) => {
  // Route `schema` objects in this codebase are documentation only. Request
  // validation is done with Zod inside the handlers (so the 400 error shape
  // stays the one plugins/error-handler.ts produces), and responses are
  // returned as-is from Prisma. Without these two overrides Fastify would
  // also run Ajv validation against the docs schemas and use them to filter
  // response fields, silently changing runtime behavior.
  fastify.setValidatorCompiler(() => (data) => ({ value: data }));
  fastify.setSerializerCompiler(() => (data) => JSON.stringify(data));

  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'FoodBowl API',
        version: process.env.npm_package_version ?? '0.1.0',
        description,
      },
      tags: [
        { name: 'Health', description: 'Liveness probe.' },
        { name: 'Auth', description: 'Registration, login, token refresh and logout.' },
        { name: 'Profile', description: 'Self-service actions for the logged-in user (any role).' },
        {
          name: 'Admin Users',
          description: 'Owner-only user management. Every route requires the `users.manage` permission.',
        },
        {
          name: 'Menu',
          description: 'Public menu browsing, plus menu management for users with `menu.manage`.',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Access token from `POST /api/v1/auth/login`.',
          },
          refreshCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: REFRESH_COOKIE,
            description:
              'httpOnly refresh cookie set by login/register/refresh. The browser sends it automatically; it cannot be set by hand.',
          },
        },
        schemas: componentSchemas as never,
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
    },
  });
});
