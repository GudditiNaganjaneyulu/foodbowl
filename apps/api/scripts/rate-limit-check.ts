/**
 * Verifies the auth rate limiter actually blocks scripted signup/login spam.
 * Hits a RUNNING dev server over real HTTP — this is a defensive check
 * against your own local instance, not a load-testing tool for anyone else's.
 *
 * Only ever point this at localhost. It fires real POST /register and
 * POST /login traffic; against a shared or production API that's a denial-
 * of-service risk, not a test, so the script refuses non-local targets.
 *
 * Side effects: the register flood creates up to 10 real customer accounts
 * in whatever database the target server is using (emails prefixed
 * `ratelimit-test-`). The script deletes them itself at the end via
 * `POST /admin/users/cleanup-test-accounts`, logging in as the seeded owner
 * account to do it — override ADMIN_EMAIL/ADMIN_PASSWORD if you've changed
 * that account's password. If the admin login fails, cleanup is skipped and
 * the accounts are left behind (findable by that same email prefix, e.g. via
 * `pnpm --filter @foodbowl/api db:studio`, or re-run once login works again —
 * cleanup only ever deletes by that exact prefix, so it's safe to re-run).
 * The script also consumes the register (1/hour) and login (1/min) rate-limit
 * buckets for your own IP against that server for the rest of their windows —
 * expect real signups/logins from the same machine to 429 for a bit after.
 *
 * Usage:
 *   pnpm --filter @foodbowl/api security:rate-limit-check
 *   API_URL=http://localhost:4100 pnpm --filter @foodbowl/api security:rate-limit-check
 */

const BASE_URL = process.env.API_URL ?? 'http://localhost:4000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'owner@foodbowl.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Password123!';
const REGISTER_LIMIT = 10;
const LOGIN_LIMIT = 10;
const ATTEMPTS = 15; // a few over each limit, so we see both sides of the boundary

function assertLocalTarget(url: string) {
  const hostname = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    console.error(
      `Refusing to run against "${hostname}". This script fires real signup/login spam — ` +
        `only ever point it at your own local dev server (API_URL must be localhost/127.0.0.1).`,
    );
    process.exit(1);
  }
}

interface Attempt {
  i: number;
  status: number;
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** For the flood loops, which only care about the status — draining the body avoids a half-read socket. */
async function postStatus(path: string, body: unknown): Promise<number> {
  const res = await post(path, body);
  await res.text().catch(() => undefined);
  return res.status;
}

/** Logs in as the seeded owner so cleanup can call the admin-only delete endpoint. */
async function loginAsAdmin(): Promise<string | null> {
  const res = await post('/api/v1/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!res.ok) {
    console.warn(
      `\nCould not log in as ${ADMIN_EMAIL} (HTTP ${res.status}) — cleanup will be skipped, and the test ` +
        'accounts the register flood creates will be left in the database. Set ADMIN_EMAIL/ADMIN_PASSWORD ' +
        'if the seeded owner account has been changed.',
    );
    return null;
  }
  const body = (await res.json()) as { accessToken?: string };
  return body.accessToken ?? null;
}

/** Deletes every account the register flood just created (fixed email prefix, server-side — see admin-users.service.ts). */
async function cleanupTestAccounts(adminToken: string): Promise<void> {
  const res = await post('/api/v1/admin/users/cleanup-test-accounts', undefined, {
    authorization: `Bearer ${adminToken}`,
  });
  if (!res.ok) {
    console.warn(`\nCleanup call failed (HTTP ${res.status}) — test accounts were left in the database.`);
    return;
  }
  const result = (await res.json()) as { deletedCount: number; skippedCount: number; skipped: string[] };
  console.log(`\nCleanup: deleted ${result.deletedCount} test account(s).`);
  if (result.skippedCount > 0) {
    console.warn(`  Skipped ${result.skippedCount} (unexpectedly had order/assignment/audit history): ${result.skipped.join(', ')}`);
  }
}

async function checkRegisterFlood(): Promise<boolean> {
  console.log(`\n=== Registration flood: ${ATTEMPTS} signups from one IP (limit: ${REGISTER_LIMIT}/hour) ===`);
  const stamp = Date.now();
  const attempts: Attempt[] = [];
  for (let i = 1; i <= ATTEMPTS; i++) {
    const status = await postStatus('/api/v1/auth/register', {
      email: `ratelimit-test-${stamp}-${i}@example.com`,
      password: 'TestPassword123!',
      name: `Rate Limit Test ${i}`,
    });
    attempts.push({ i, status });
    console.log(`  #${i}: HTTP ${status}`);
  }
  return evaluate(attempts, REGISTER_LIMIT);
}

async function checkLoginFlood(): Promise<boolean> {
  console.log(`\n=== Login flood: ${ATTEMPTS} attempts from one IP (limit: ${LOGIN_LIMIT}/min) ===`);
  // Deliberately bogus credentials: the rate limiter runs as a preHandler
  // before the login logic, so it fires on invalid attempts too — exactly
  // the credential-stuffing shape this limit exists to stop, and it means
  // this check doesn't depend on a real account existing.
  const attempts: Attempt[] = [];
  for (let i = 1; i <= ATTEMPTS; i++) {
    const status = await postStatus('/api/v1/auth/login', {
      email: 'nonexistent-rate-limit-test@example.com',
      password: 'wrong-password',
    });
    attempts.push({ i, status });
    console.log(`  #${i}: HTTP ${status}`);
  }
  return evaluate(attempts, LOGIN_LIMIT);
}

function evaluate(attempts: Attempt[], limit: number): boolean {
  const firstBlocked = attempts.find((a) => a.status === 429);
  const blockedCount = attempts.filter((a) => a.status === 429).length;
  if (!firstBlocked) {
    console.log(`  -> No 429 in ${attempts.length} attempts. The limiter did NOT engage.`);
    return false;
  }
  console.log(
    `  -> First 429 at attempt #${firstBlocked.i} (expected #${limit + 1}). ${blockedCount}/${attempts.length} blocked.`,
  );
  return firstBlocked.i === limit + 1;
}

async function main() {
  assertLocalTarget(BASE_URL);
  console.log(`Target: ${BASE_URL}`);
  console.log(
    'If neither check sees a 429: confirm UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are set in ' +
      '.env and the server was started with them loaded — the limiter silently no-ops without Redis.',
  );

  // Logged in first, before either flood — the login flood below deliberately
  // exhausts the login rate-limit bucket for this IP, which would otherwise
  // lock this admin login out too.
  const adminToken = await loginAsAdmin();

  const registerOk = await checkRegisterFlood();
  if (adminToken) {
    await cleanupTestAccounts(adminToken);
  }

  const loginOk = await checkLoginFlood();

  console.log('\n=== Result ===');
  console.log(`Register rate limit (10/hour/IP): ${registerOk ? 'PASS' : 'FAIL'}`);
  console.log(`Login rate limit (10/min/IP):     ${loginOk ? 'PASS' : 'FAIL'}`);

  process.exit(registerOk && loginOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Script crashed:', err);
  process.exit(1);
});
