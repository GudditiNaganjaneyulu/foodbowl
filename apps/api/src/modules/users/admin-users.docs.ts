import type { FastifySchema } from 'fastify';
import {
  ALL_ROLES,
  PERMISSIONS,
  createUserSchema,
  updateUserPermissionsSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from '@foodbowl/shared';
import {
  bearerAuth,
  errorResponses,
  fromZod,
  idParam,
  protectedErrors,
  ref,
  requiresPermission,
} from '../../lib/openapi';

const gate = requiresPermission(PERMISSIONS.USERS_MANAGE);

export const listUsersDocs: FastifySchema = {
  tags: ['Admin Users'],
  summary: 'List users',
  description: `Newest first. Includes each user's role and per-user permission overrides.\n\n${gate}`,
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ALL_ROLES, description: 'Only users with this role.' },
      isActive: { type: 'boolean', description: 'Only active (`true`) or deactivated (`false`) users.' },
    },
  },
  response: {
    200: { description: 'Matching users.', type: 'array', items: ref('AdminUser') },
    ...errorResponses(protectedErrors),
  },
};

export const createUserDocs: FastifySchema = {
  tags: ['Admin Users'],
  summary: 'Create a staff, delivery or owner account',
  description: `The only way to create non-customer accounts (customers self-register). \`role\` may be any role except \`customer\`. The user signs in with \`temporaryPassword\` and should change it via \`PATCH /api/v1/users/me/password\`. Writes an audit log entry.\n\n${gate}`,
  security: bearerAuth,
  body: fromZod(createUserSchema, {
    example: {
      email: 'chef@example.com',
      name: 'Asha Rao',
      phone: '+919876543210',
      role: 'staff',
      temporaryPassword: 'temp-pass-123',
    },
  }),
  response: {
    201: { description: 'User created.', ...ref('AdminUser') },
    ...errorResponses({ 400: 'Validation failed, or unknown role.', ...protectedErrors, 409: 'Email already in use.' }),
  },
};

export const setUserStatusDocs: FastifySchema = {
  tags: ['Admin Users'],
  summary: 'Activate or deactivate a user',
  description: `Deactivating also revokes all of the user's refresh tokens so live sessions end at once. You cannot deactivate your own account. Writes an audit log entry.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateUserStatusSchema, { example: { isActive: false } }),
  response: {
    200: { description: 'Updated user.', ...ref('AdminUser') },
    ...errorResponses({
      400: 'Validation failed, or attempted to deactivate your own account.',
      ...protectedErrors,
    }),
  },
};

export const setUserRoleDocs: FastifySchema = {
  tags: ['Admin Users'],
  summary: 'Change a user\'s role',
  description: `**Resets** the user's per-user permission overrides (they applied to the old role's baseline) and bumps \`permVersion\`. Writes an audit log entry.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateUserRoleSchema, { example: { role: 'delivery_partner' } }),
  response: {
    200: { description: 'Updated user.', ...ref('AdminUser') },
    ...errorResponses({ 400: 'Validation failed, or unknown role.', ...protectedErrors }),
  },
};

export const setUserPermissionsDocs: FastifySchema = {
  tags: ['Admin Users'],
  summary: 'Grant or revoke permissions for a staff user',
  description: `Per-user overrides apply to **staff** accounts only. \`granted: true\` adds a permission beyond the staff defaults; \`granted: false\` revokes a default. Owner-only permissions (\`users.manage\`, \`restaurant.manage\`) cannot be granted. Applied atomically and audited.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateUserPermissionsSchema, {
    example: {
      grants: [
        { permission: 'menu.manage', granted: true },
        { permission: 'orders.view', granted: false },
      ],
    },
  }),
  response: {
    200: { description: 'Permissions updated.', ...ref('OkResponse') },
    ...errorResponses({
      400: 'Validation failed, or the target user is not a staff account.',
      401: protectedErrors[401],
      403: 'Missing the required permission, or attempted to grant an owner-only permission to staff.',
    }),
  },
};

export const deleteUserDocs: FastifySchema = {
  tags: ['Admin Users'],
  summary: 'Delete a user',
  description: `Only possible for users with no history (orders, delivery assignments or audit records) — otherwise deactivate instead. Writes an audit log entry.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  response: {
    204: { description: 'User deleted. No body.', type: 'null' },
    ...errorResponses({
      ...protectedErrors,
      409: 'User has historical orders/assignments/audit records — deactivate instead.',
    }),
  },
};
