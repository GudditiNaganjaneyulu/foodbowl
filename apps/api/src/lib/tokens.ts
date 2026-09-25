import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export interface AccessTokenClaims {
  sub: string; // user id
  role: string;
  permVersion: number;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, permVersion: claims.permVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, accessSecret);
  return {
    sub: payload.sub as string,
    role: payload.role as string,
    permVersion: payload.permVersion as number,
  };
}

/**
 * Refresh tokens carry a unique `jti`, which is also the primary key of their
 * database row — so redeeming one is a single indexed lookup instead of a scan
 * over everything the user has ever been issued. (It also makes two tokens
 * minted in the same second differ, which iat's one-second resolution can't.)
 */
export async function signRefreshToken(userId: string): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.REFRESH_TOKEN_TTL)
    .sign(refreshSecret);
  return { token, jti };
}

/** Verifies signature and expiry only. Tokens without a `jti` (issued before it existed) are rejected. */
export async function verifyRefreshToken(token: string): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, refreshSecret);
  if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') throw new Error('malformed refresh token');
  return { sub: payload.sub, jti: payload.jti };
}

/**
 * Refresh tokens are long random-looking JWTs, not human passwords, so a fast
 * hash is the right tool: there is nothing to brute-force, and argon2 here made
 * every refresh cost CPU proportional to how many tokens the user had.
 */
export const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');
