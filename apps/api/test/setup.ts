/**
 * Runs before every test file, before any app module is imported.
 *
 * Integration tests write real users/orders, so they must never run against
 * the development (Neon) database from .env. They only run when
 * TEST_DATABASE_URL is set, and it replaces DATABASE_URL for the process.
 * Unit tests need no database at all.
 */
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';
process.env.OTEL_SDK_DISABLED = 'true';
// Empty strings (not deletes): dotenv would otherwise refill them from .env,
// and tests must never touch the real Redis or send real email.
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
process.env.EMAIL_NOTIFICATIONS_ENABLED = 'false';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

// Built-in file storage writes here during tests, never into the real uploads folder.
process.env.UPLOAD_DIR = `${process.env.TMPDIR ?? '/tmp'}/foodbowl-test-uploads-${process.pid}`;

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  // Unit tests still import modules that load the env schema.
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:1/unused';
}
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-0123456789';
