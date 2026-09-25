import type { FastifyInstance } from 'fastify';
import { loginSchema, registerSchema } from '@foodbowl/shared';
import { env } from '../../config/env';
import { requireAuth } from '../../plugins/auth';
import { rateLimit } from '../../lib/rate-limit';
import * as authService from './auth.service';
import { loginDocs, logoutDocs, refreshDocs, registerDocs } from './auth.docs';

const REFRESH_COOKIE = 'foodbowl_refresh_token';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/register',
    // Loose limit — mainly to slow down scripted account-creation spam, not
    // to annoy a real person who mistypes a password once or twice.
    { schema: registerDocs, preHandler: rateLimit({ windowSeconds: 60 * 60, max: 10, keyPrefix: 'register' }) },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const { refreshToken, ...result } = await authService.register(body);
      setRefreshCookie(reply, refreshToken);
      return result;
    },
  );

  fastify.post(
    '/login',
    // Tighter limit — this is the actual brute-force/credential-stuffing
    // target. 10/min per IP is generous for a real user, punishing for a
    // password-guessing script.
    { schema: loginDocs, preHandler: rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'login' }) },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const { refreshToken, ...result } = await authService.login(body);
      setRefreshCookie(reply, refreshToken);
      return result;
    },
  );

  fastify.post('/refresh', { schema: refreshDocs }, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) return reply.code(401).send({ error: 'No refresh token' });
    const { refreshToken, ...result } = await authService.refresh(token);
    setRefreshCookie(reply, refreshToken);
    return result;
  });

  fastify.post('/logout', { schema: logoutDocs, preHandler: requireAuth }, async (request, reply) => {
    await authService.logoutAll(request.user!.sub);
    reply.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  });
}

function setRefreshCookie(reply: import('fastify').FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}
