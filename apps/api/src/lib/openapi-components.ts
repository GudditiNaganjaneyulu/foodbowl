import { ALL_PERMISSIONS, ALL_ROLES } from '@foodbowl/shared';
import { ref, type JsonSchema } from './openapi';
import { shopComponentSchemas } from './openapi-components-shop';

const id = (description: string): JsonSchema => ({ type: 'string', description, example: 'cm0abc123def456' });
const timestamp = (description: string): JsonSchema => ({
  type: 'string',
  format: 'date-time',
  description,
  example: '2026-09-22T09:57:59.000Z',
});
// Prisma serializes Decimal columns to JSON strings (e.g. "199.00"), not numbers.
const decimal = (description: string, example: string): JsonSchema => ({
  type: 'string',
  description: `${description} Decimal serialized as a string.`,
  example,
});

export const componentSchemas: Record<string, JsonSchema> = {
  ...shopComponentSchemas,

  ErrorResponse: {
    type: 'object',
    required: ['error'],
    properties: { error: { type: 'string', example: 'Unauthorized' } },
  },

  ValidationErrorResponse: {
    type: 'object',
    required: ['error', 'details'],
    properties: {
      error: { type: 'string', example: 'Validation failed' },
      details: {
        type: 'object',
        description: 'Output of Zod `error.flatten()`.',
        properties: {
          formErrors: { type: 'array', items: { type: 'string' } },
          fieldErrors: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
            example: { email: ['Invalid email'] },
          },
        },
      },
    },
  },

  OkResponse: {
    type: 'object',
    required: ['ok'],
    properties: { ok: { type: 'boolean', example: true } },
  },

  HealthResponse: {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', example: 'ok' } },
  },

  AuthUser: {
    type: 'object',
    required: ['id', 'email', 'name', 'role', 'permissions'],
    properties: {
      id: id('User id.'),
      email: { type: 'string', format: 'email', example: 'jane@example.com' },
      name: { type: 'string', example: 'Jane Doe' },
      role: { type: 'string', enum: ALL_ROLES, example: 'customer' },
      permissions: {
        type: 'array',
        description: 'Effective permissions: role defaults overlaid with per-user overrides.',
        items: { type: 'string', enum: ALL_PERMISSIONS },
        example: [],
      },
    },
  },

  AuthResponse: {
    type: 'object',
    required: ['accessToken', 'user'],
    properties: {
      accessToken: {
        type: 'string',
        description: 'Short-lived JWT (see ACCESS_TOKEN_TTL, default 15m). Send as `Authorization: Bearer <token>`.',
        example: 'eyJhbGciOiJIUzI1NiJ9...',
      },
      user: ref('AuthUser'),
    },
  },

  Role: {
    type: 'object',
    properties: {
      id: id('Role id.'),
      key: { type: 'string', enum: ALL_ROLES },
      name: { type: 'string', example: 'Staff' },
    },
  },

  Permission: {
    type: 'object',
    properties: {
      id: id('Permission id.'),
      key: { type: 'string', enum: ALL_PERMISSIONS, example: 'menu.manage' },
      description: { type: 'string', nullable: true },
    },
  },

  UserPermissionOverride: {
    type: 'object',
    description: 'A per-user override on top of the role defaults. `granted: false` revokes a default.',
    properties: {
      userId: id('User id.'),
      permissionId: id('Permission id.'),
      granted: { type: 'boolean' },
      permission: ref('Permission'),
    },
  },

  AdminUser: {
    type: 'object',
    description:
      'A user record as returned to admins. `passwordHash` is never included. `role` and `userPermissions` are present only on endpoints that say so.',
    required: ['id', 'email', 'name', 'roleId', 'isActive', 'permVersion', 'createdAt', 'updatedAt'],
    properties: {
      id: id('User id.'),
      email: { type: 'string', format: 'email' },
      phone: { type: 'string', nullable: true },
      name: { type: 'string' },
      roleId: id('Role id.'),
      isActive: { type: 'boolean' },
      permVersion: {
        type: 'integer',
        description: 'Bumped whenever role, status or permissions change.',
        example: 1,
      },
      createdAt: timestamp('Creation time.'),
      updatedAt: timestamp('Last update time.'),
      role: ref('Role'),
      userPermissions: { type: 'array', items: ref('UserPermissionOverride') },
    },
  },

  Modifier: {
    type: 'object',
    properties: {
      id: id('Modifier id.'),
      modifierGroupId: id('Parent modifier group id.'),
      name: { type: 'string', example: 'Extra cheese' },
      priceDelta: decimal('Price added when this modifier is selected.', '20.00'),
    },
  },

  ModifierGroup: {
    type: 'object',
    properties: {
      id: id('Modifier group id.'),
      menuItemId: id('Parent menu item id.'),
      name: { type: 'string', example: 'Toppings' },
      minSelect: { type: 'integer', example: 0 },
      maxSelect: { type: 'integer', example: 3 },
      required: { type: 'boolean' },
      modifiers: { type: 'array', items: ref('Modifier') },
    },
  },

  MenuItem: {
    type: 'object',
    properties: {
      id: id('Menu item id.'),
      categoryId: id('Parent category id.'),
      name: { type: 'string', example: 'Paneer Tikka' },
      description: { type: 'string', nullable: true },
      price: decimal('Item price.', '249.00'),
      imageUrl: { type: 'string', format: 'uri', nullable: true },
      isVeg: { type: 'boolean' },
      isAvailable: { type: 'boolean' },
      sortOrder: { type: 'integer' },
      createdAt: timestamp('Creation time.'),
      updatedAt: timestamp('Last update time.'),
      modifierGroups: {
        type: 'array',
        description: 'Included on menu browse and item creation; omitted on update.',
        items: ref('ModifierGroup'),
      },
    },
  },

  Category: {
    type: 'object',
    properties: {
      id: id('Category id.'),
      restaurantId: id('Owning restaurant id.'),
      name: { type: 'string', example: 'Starters' },
      sortOrder: { type: 'integer' },
      isActive: { type: 'boolean' },
    },
  },

  CategoryWithItems: {
    type: 'object',
    allOf: [
      ref('Category'),
      {
        type: 'object',
        properties: {
          menuItems: {
            type: 'array',
            description: 'Available items only, ordered by `sortOrder`.',
            items: ref('MenuItem'),
          },
        },
      },
    ],
  },

  MenuResponse: {
    type: 'object',
    required: ['categories'],
    properties: {
      categories: {
        type: 'array',
        description: 'Active categories only, ordered by `sortOrder`.',
        items: ref('CategoryWithItems'),
      },
    },
  },
};
