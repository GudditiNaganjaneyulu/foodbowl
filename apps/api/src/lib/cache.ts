import { redis } from './redis';
import { logger } from './logger';

/**
 * Cache-aside, same shape everywhere it's used (originally inline in
 * modules/menu/menu.routes.ts — pulled out here once a second and third
 * caller showed up). Any Redis failure, or Redis being unconfigured at all,
 * just falls through to calling `fetch` directly: caching is a speed
 * optimization in this app, never a correctness dependency (see lib/redis.ts).
 */
export async function cached<T>(key: string, ttlSeconds: number, fetch: () => Promise<T>): Promise<T> {
  if (redis) {
    try {
      const hit = await redis.get<T>(key);
      if (hit !== null && hit !== undefined) return hit;
    } catch (err) {
      logger.warn({ err, key }, 'cache read failed, falling back to the database');
    }
  }

  const value = await fetch();

  if (redis) {
    redis.set(key, value, { ex: ttlSeconds }).catch((err) => {
      logger.warn({ err, key }, 'cache write failed — reads will just keep hitting the database');
    });
  }

  return value;
}

/** Delete one or more keys. Never throws — a failed invalidation just means the TTL is the fallback. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, 'cache invalidation failed — it will self-correct once the TTL expires');
  }
}
