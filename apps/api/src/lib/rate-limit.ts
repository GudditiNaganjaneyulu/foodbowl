import type { FastifyReply, FastifyRequest } from 'fastify';
import { redis } from './redis';
import { logger } from './logger';

interface RateLimitOptions {
  /** Fixed window length. */
  windowSeconds: number;
  /** Max requests per key within the window. */
  max: number;
  /** Namespaces the Redis key so different routes don't share a counter. */
  keyPrefix: string;
}

/**
 * Simple fixed-window counter (INCR + EXPIRE) per client IP — enough to
 * blunt naive brute-force/credential-stuffing against auth endpoints without
 * pulling in a whole rate-limiting library for one use case. No-ops (never
 * blocks) when Redis isn't configured, rather than either failing closed
 * (breaks login for everyone if Redis hiccups) or failing open silently
 * without saying so — the boot-time warning in lib/redis.ts covers the
 * "silently" part.
 */
export function rateLimit({ windowSeconds, max, keyPrefix }: RateLimitOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!redis) return;

    const key = `ratelimit:${keyPrefix}:${request.ip}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (count > max) {
        return reply.code(429).send({ error: 'Too many requests — please try again shortly.' });
      }
    } catch (err) {
      // A Redis hiccup shouldn't take login down with it — log and let the
      // request through unrestricted for this one call.
      logger.warn({ err, keyPrefix }, 'rate limit check failed, allowing request through');
    }
  };
}
