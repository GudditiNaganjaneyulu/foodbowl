import type { FastifySchema } from 'fastify';
import { loginSchema, registerSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod, ref, refreshCookieAuth } from '../../lib/openapi';

const setCookieHeader = {
  'Set-Cookie': {
    type: 'string',
    description:
      'httpOnly `foodbowl_refresh_token` cookie (SameSite=Lax, 7 days; `Secure` when NODE_ENV=production).',
  },
};

export const registerDocs: FastifySchema = {
  tags: ['Auth'],
  summary: 'Register a customer account',
  description:
    'Self-service signup. Always creates a `customer`; staff, delivery and owner accounts are created by an owner via `POST /api/v1/admin/users`. Logs the new user in immediately. Rate limited to 10 requests/hour per IP.',
  body: fromZod(registerSchema, {
    example: { email: 'jane@example.com', password: 'a-strong-password', name: 'Jane Doe', phone: '+919876543210' },
  }),
  response: {
    200: { description: 'Account created and logged in.', headers: setCookieHeader, ...ref('AuthResponse') },
    ...errorResponses({
      400: 'Validation failed.',
      409: 'Email already registered.',
      429: 'Too many requests.',
    }),
  },
};

export const loginDocs: FastifySchema = {
  tags: ['Auth'],
  summary: 'Log in',
  description:
    'Exchanges email and password for an access token and sets the refresh cookie. Deactivated accounts get the same error as a wrong password. Rate limited to 10 requests/minute per IP.',
  body: fromZod(loginSchema, { example: { email: 'owner@foodbowl.local', password: 'your-password' } }),
  response: {
    200: { description: 'Logged in.', headers: setCookieHeader, ...ref('AuthResponse') },
    ...errorResponses({
      400: 'Validation failed.',
      401: 'Invalid credentials.',
      429: 'Too many requests.',
    }),
  },
};

export const refreshDocs: FastifySchema = {
  tags: ['Auth'],
  summary: 'Refresh the access token',
  description:
    'Reads the `foodbowl_refresh_token` cookie, revokes that token and issues a new access token plus a **new** refresh cookie (rotation). Takes no body.',
  security: refreshCookieAuth,
  response: {
    200: { description: 'New access token issued.', headers: setCookieHeader, ...ref('AuthResponse') },
    ...errorResponses({
      401: 'No refresh cookie, or the token is invalid, expired or already used.',
      403: 'Account has been deactivated.',
    }),
  },
};

export const logoutDocs: FastifySchema = {
  tags: ['Auth'],
  summary: 'Log out everywhere',
  description:
    'Revokes **all** of the user\'s refresh tokens (every device) and clears the refresh cookie. Already-issued access tokens stay valid until they expire.',
  security: bearerAuth,
  response: {
    200: { description: 'Logged out.', ...ref('OkResponse') },
    ...errorResponses({ 401: 'Missing, invalid or expired access token.' }),
  },
};
