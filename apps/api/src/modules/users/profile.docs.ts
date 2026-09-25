import type { FastifySchema } from 'fastify';
import { addressSchema, changePasswordSchema, updateAddressSchema, updateProfileSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod, idParam, ref } from '../../lib/openapi';

export const changePasswordDocs: FastifySchema = {
  tags: ['Profile'],
  summary: 'Change your own password',
  description:
    'Available to any logged-in role. Requires the current password, and revokes every refresh token so other devices are logged out (the current access token keeps working until it expires). This is how the seeded default accounts should be moved off their known dev password. Rate limited to 10 requests/minute per IP.',
  security: bearerAuth,
  body: fromZod(changePasswordSchema, {
    example: { currentPassword: 'your-current-password', newPassword: 'a-new-strong-password' },
  }),
  response: {
    200: { description: 'Password changed.', ...ref('OkResponse') },
    ...errorResponses({
      400: 'Validation failed (e.g. new password shorter than 8 characters).',
      401: 'Missing/invalid access token, or the current password is incorrect.',
      429: 'Too many requests.',
    }),
  },
};

const unauthorized = { 401: 'Missing, invalid or expired access token.' } as const;

export const getMeDocs: FastifySchema = {
  tags: ['Profile'],
  summary: 'Get my profile',
  description: 'The logged-in user with their role and effective permissions.',
  security: bearerAuth,
  response: { 200: { description: 'My profile.', ...ref('Me') }, ...errorResponses(unauthorized) },
};

export const updateMeDocs: FastifySchema = {
  tags: ['Profile'],
  summary: 'Update my profile',
  description: 'Change your name and/or phone number. Email and role cannot be changed here.',
  security: bearerAuth,
  body: fromZod(updateProfileSchema, { example: { name: 'Jane Doe', phone: '+919876543210' } }),
  response: {
    200: { description: 'The updated profile.', ...ref('Me') },
    ...errorResponses({ 400: 'Validation failed.', ...unauthorized }),
  },
};

const addressExample = {
  label: 'Home',
  line1: '42 Wallaby Way',
  city: 'Flavor Town',
  state: 'CA',
  postalCode: '90210',
  isDefault: true,
};

export const listAddressesDocs: FastifySchema = {
  tags: ['Profile'],
  summary: 'List my saved addresses',
  description: 'Default address first.',
  security: bearerAuth,
  response: {
    200: { description: 'My addresses.', type: 'array', items: ref('Address') },
    ...errorResponses(unauthorized),
  },
};

export const createAddressDocs: FastifySchema = {
  tags: ['Profile'],
  summary: 'Save a delivery address',
  description: 'Your first address becomes the default automatically. Setting `isDefault: true` un-defaults the others.',
  security: bearerAuth,
  body: fromZod(addressSchema, { example: addressExample }),
  response: {
    201: { description: 'Address saved.', ...ref('Address') },
    ...errorResponses({ 400: 'Validation failed.', ...unauthorized }),
  },
};

export const updateAddressDocs: FastifySchema = {
  tags: ['Profile'],
  summary: 'Edit a saved address',
  description:
    'Partial update. An address that is on an **active** order cannot have its details edited (the rider is navigating to it) — only `isDefault` may change.',
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateAddressSchema, { example: { label: 'Work', isDefault: true } }),
  response: {
    200: { description: 'The updated address.', ...ref('Address') },
    ...errorResponses({
      400: 'Validation failed.',
      ...unauthorized,
      404: 'No such address.',
      409: 'The address is on an active order.',
    }),
  },
};

export const deleteAddressDocs: FastifySchema = {
  tags: ['Profile'],
  summary: 'Delete a saved address',
  description: 'Not possible once an order has used the address (it is part of your order history). If the default is deleted, the oldest remaining address becomes the default.',
  security: bearerAuth,
  params: idParam,
  response: {
    204: { description: 'Deleted. No body.', type: 'null' },
    ...errorResponses({ ...unauthorized, 404: 'No such address.', 409: 'The address is part of your order history.' }),
  },
};
