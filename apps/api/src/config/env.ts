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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

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
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('orders@foodbowl.local'),
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
