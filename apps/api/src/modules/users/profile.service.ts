import argon2 from 'argon2';
import type { ChangePasswordInput } from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';

export class ProfileError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

/**
 * Self-service password change — this is how the default seeded accounts
 * (owner@foodbowl.local etc.) are meant to be rotated off their known dev
 * password, not by editing the DB directly. Revokes every other refresh
 * token so a changed password actually logs out other sessions/devices,
 * while leaving the current one's short-lived access token to expire
 * naturally rather than force an immediate re-login.
 */
export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const valid = await argon2.verify(user.passwordHash, input.currentPassword);
  if (!valid) throw new ProfileError('Current password is incorrect', 401);

  const passwordHash = await argon2.hash(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info({ userId }, 'user changed their own password');
}
