import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * `dotenv/config`'s default lookup is relative to process.cwd(), which for
 * `pnpm --filter @foodbowl/api dev` (run from the repo root) is actually
 * apps/api, not the repo root where .env lives — so the default import
 * silently found nothing. Resolve the path from this file's own location
 * instead, so it works the same whether invoked via pnpm filter, directly
 * inside apps/api, or from Docker (where no .env file exists at all and this
 * is a harmless no-op — env vars already come from docker-compose's env_file).
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
dotenv.config({ path: path.join(repoRoot, '.env') });

/**
 * `z.coerce.boolean()` is a trap for env vars: it is `Boolean(value)`, so the
 * STRING "false" becomes `true`. Parse the words explicitly instead.
 */
const envBool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? fallback : ['true', '1', 'yes'].includes(v.trim().toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  // Built-in file storage (used when Supabase isn't configured): where files are
  // written, and this API's public address for building upload URLs behind a proxy.
  UPLOAD_DIR: z.string().optional(),
  PUBLIC_API_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET_MENU: z.string().default('menu-images'),
  SUPABASE_STORAGE_BUCKET_ASSETS: z.string().default('restaurant-assets'),
  SUPABASE_STORAGE_BUCKET_PROOFS: z.string().default('delivery-proofs'),
  SUPABASE_STORAGE_BUCKET_AVATARS: z.string().default('user-avatars'),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('foodbowl-api'),
  LOG_LEVEL: z.string().default('info'),

  // Defaults target local Mailpit (no auth). Brevo's free tier (300
  // emails/day) needs SMTP_USER/SMTP_PASSWORD + SMTP_SECURE=false on port
  // 587 (STARTTLS) — see .env.example.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: envBool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('orders@foodbowl.local'),
  // Opt-in: real emails only go out when this is explicitly true, so a dev
  // machine with live Brevo credentials in .env never mails seeded accounts.
  EMAIL_NOTIFICATIONS_ENABLED: envBool(false),

  // @upstash/redis is an HTTP/REST client (works over fetch, no persistent
  // TCP socket — fine for a container, but specifically needs these REST
  // credentials, not a rediss:// connection string). Optional: rate limiting
  // and menu caching both no-op cleanly when unset — see lib/redis.ts.
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

/**
 * Fails fast on boot with a readable error instead of surfacing a confusing
 * runtime failure the first time a missing var is touched.
 */
function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
