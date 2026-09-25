import type { FastifySchema } from 'fastify';
import { changePasswordSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod, ref } from '../../lib/openapi';

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
