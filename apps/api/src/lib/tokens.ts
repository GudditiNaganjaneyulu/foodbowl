import { randomUUID } from 'node:crypto';
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

export async function signRefreshToken(userId: string): Promise<string> {
  // The unique jti matters: iat only has one-second resolution, so without it
  // two refresh tokens minted for the same user within a second are
  // byte-identical — which makes "rotation" a no-op and lets a revoked token
  // keep matching its replacement's stored hash.
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomUUID())
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.REFRESH_TOKEN_TTL)
    .sign(refreshSecret);
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return { sub: payload.sub as string };
}
