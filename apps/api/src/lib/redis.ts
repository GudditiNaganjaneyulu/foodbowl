import { Redis } from '@upstash/redis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Optional by design — the app must boot and work fine with this unset;
 * rate limiting (lib/rate-limit.ts) and menu caching (modules/menu) both
 * fall through to "no limit" / "always miss the cache" when `redis` is null,
 * rather than crashing or silently pretending to protect something they
 * aren't. This is a learning/testing project (see BUILD_PROMPT.md §1.1) —
 * Redis is a nice-to-have here, not a hard dependency.
 *
 * Needs UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN specifically, from
 * the Upstash console's "REST API" tab — NOT the rediss://... connection
 * string from the "Connect to your database" TCP tab, which this HTTP-based
 * client can't use at all.
 */
export const redis: Redis | null =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

if (!redis) {
  logger.warn(
    'UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set — auth rate limiting and menu caching are disabled (app still works, just without them)',
  );
}
