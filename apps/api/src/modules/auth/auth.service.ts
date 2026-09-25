import argon2 from 'argon2';
import { timingSafeEqual } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { ROLES, type RegisterInput, type LoginInput } from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { hashRefreshToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens';
import { getEffectivePermissions } from '../../lib/rbac';

const tracer = trace.getTracer('foodbowl-api');

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

async function buildAuthPayload(userId: string, role: string, permVersion: number) {
  const [accessToken, permissions] = await Promise.all([
    signAccessToken({ sub: userId, role, permVersion }),
    getEffectivePermissions(userId),
  ]);
  return { accessToken, permissions: [...permissions] };
}

export async function register(input: RegisterInput) {
  return tracer.startActiveSpan('auth.register', async (span) => {
    try {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw new AuthError('Email already registered', 409);

      const customerRole = await prisma.role.findUniqueOrThrow({
        where: { key: ROLES.CUSTOMER },
      });
      const passwordHash = await argon2.hash(input.password);

      const user = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          phone: input.phone,
          passwordHash,
          roleId: customerRole.id,
        },
      });
      await prisma.cart.create({ data: { userId: user.id } });

      logger.info({ userId: user.id }, 'customer registered');
      const refreshToken = await issueRefreshToken(user.id);
      const { accessToken, permissions } = await buildAuthPayload(
        user.id,
        ROLES.CUSTOMER,
        user.permVersion,
      );

      return {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, role: ROLES.CUSTOMER, permissions },
      };
    } finally {
      span.end();
    }
  });
}

export async function login(input: LoginInput) {
  return tracer.startActiveSpan('auth.login', async (span) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email: input.email },
        include: { role: true },
      });
      if (!user || !user.isActive) throw new AuthError('Invalid credentials', 401);

      const valid = await argon2.verify(user.passwordHash, input.password);
      if (!valid) throw new AuthError('Invalid credentials', 401);

      const refreshToken = await issueRefreshToken(user.id);
      const { accessToken, permissions } = await buildAuthPayload(
        user.id,
        user.role.key,
        user.permVersion,
      );

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role.key,
          permissions,
        },
      };
    } finally {
      span.end();
    }
  });
}

/** One person can be signed in on several devices, but not without limit. */
const MAX_LIVE_SESSIONS = 20;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function issueRefreshToken(userId: string): Promise<string> {
  const { token, jti } = await signRefreshToken(userId);
  const now = new Date();
  await prisma.refreshToken.create({
    data: { id: jti, userId, tokenHash: hashRefreshToken(token), expiresAt: new Date(now.getTime() + REFRESH_TTL_MS) },
  });
  await pruneSessions(userId, now);
  return token;
}

/**
 * Keeps the table from growing forever: drops tokens that are expired or were
 * revoked more than a day ago, and if someone somehow has more than
 * MAX_LIVE_SESSIONS devices signed in, signs out the oldest ones.
 */
async function pruneSessions(userId: string, now: Date) {
  await prisma.refreshToken.deleteMany({
    where: { userId, OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }] },
  });
  const live = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    skip: MAX_LIVE_SESSIONS,
    select: { id: true },
  });
  if (live.length > 0) {
    await prisma.refreshToken.updateMany({ where: { id: { in: live.map((t) => t.id) } }, data: { revokedAt: now } });
  }
}

export async function refresh(refreshToken: string) {
  const claims = await verifyRefreshToken(refreshToken).catch(() => {
    throw new AuthError('Invalid refresh token', 401);
  });

  const row = await prisma.refreshToken.findUnique({ where: { id: claims.jti } });
  const presented = Buffer.from(hashRefreshToken(refreshToken));
  const stored = Buffer.from(row?.tokenHash ?? '');
  if (
    !row ||
    row.userId !== claims.sub ||
    row.revokedAt !== null ||
    row.expiresAt <= new Date() ||
    presented.length !== stored.length ||
    !timingSafeEqual(presented, stored)
  ) {
    throw new AuthError('Invalid refresh token', 401);
  }

  // Redeem it atomically: if two requests present the same cookie at once,
  // exactly one wins (the other sees count 0) — a token can't be spent twice.
  const { count } = await prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count !== 1) throw new AuthError('Invalid refresh token', 401);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.sub }, include: { role: true } });
  if (!user.isActive) throw new AuthError('Account deactivated', 403);

  const newRefreshToken = await issueRefreshToken(user.id);
  const { accessToken, permissions } = await buildAuthPayload(user.id, user.role.key, user.permVersion);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role.key, permissions },
  };
}

export async function logoutAll(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
