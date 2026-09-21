import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { ROLES, type RegisterInput, type LoginInput } from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens';
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

async function issueRefreshToken(userId: string): Promise<string> {
  const token = await signRefreshToken(userId);
  const tokenHash = await argon2.hash(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { id: randomUUID(), userId, tokenHash, expiresAt } });
  return token;
}

export async function refresh(refreshToken: string) {
  const { sub: userId } = await verifyRefreshToken(refreshToken).catch(() => {
    throw new AuthError('Invalid refresh token', 401);
  });

  const candidates = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  const match = await Promise.any(
    candidates.map(async (c) => ((await argon2.verify(c.tokenHash, refreshToken)) ? c : Promise.reject())),
  ).catch(() => undefined);
  if (!match) throw new AuthError('Invalid refresh token', 401);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  if (!user.isActive) throw new AuthError('Account deactivated', 403);

  // rotate: revoke the used token, issue a new one
  await prisma.refreshToken.update({ where: { id: match.id }, data: { revokedAt: new Date() } });
  const newRefreshToken = await issueRefreshToken(userId);
  const { accessToken, permissions } = await buildAuthPayload(userId, user.role.key, user.permVersion);

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
