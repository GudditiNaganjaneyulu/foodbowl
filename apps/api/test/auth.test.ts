import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { deleteSince } from './cleanup';
import { ACCOUNTS, DEV_PASSWORD, describeDb, login, type Session } from './helpers';

const REFRESH = 'foodbowl_refresh_token';
let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
const startedAt = new Date();
const email = `auth-${Date.now()}@test.local`;
const password = 'first-password-1';

const post = (url: string, payload?: object, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, cookies: cookie ? { [REFRESH]: cookie } : undefined });
const refreshCookie = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === REFRESH)?.value;

describeDb('authentication (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'auth-' } } });
    await deleteSince(prisma, startedAt);
    await app.close();
  });

  it('accepts body-less POSTs that still declare a JSON content type, but rejects malformed JSON', async () => {
    // Browsers' fetch calls for /auth/refresh and /auth/logout carry the header and no body.
    const refresh = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { 'content-type': 'application/json' } });
    expect(refresh.statusCode).toBe(401); // "No refresh token" — not a 400 about the empty body
    expect(JSON.parse(refresh.body).error).toBe('No refresh token');

    const s = await login(app, ACCOUNTS.customer3);
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
    });
    expect(logout.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).error).toMatch(/not valid JSON/);
  });

  it('registers a customer, logs them in, and sets an httpOnly refresh cookie', async () => {
    const res = await post('/api/v1/auth/register', { email, password, name: 'Test Person', phone: '+1 555 0100' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toMatchObject({ email, name: 'Test Person', role: 'customer', permissions: [] });
    expect(body.accessToken).toBeTruthy();
    expect(body).not.toHaveProperty('refreshToken');
    const cookie = res.cookies.find((c) => c.name === REFRESH)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  it('never returns the password hash', async () => {
    const res = await post('/api/v1/auth/login', { email, password });
    expect(res.body).not.toMatch(/passwordHash|argon2/);
  });

  it('rejects duplicate emails and weak/invalid input', async () => {
    expect((await post('/api/v1/auth/register', { email, password, name: 'Dup' })).statusCode).toBe(409);
    expect((await post('/api/v1/auth/register', { email: 'not-an-email', password, name: 'x' })).statusCode).toBe(400);
    expect((await post('/api/v1/auth/register', { email: `x-${email}`, password: 'short', name: 'x' })).statusCode).toBe(400);
  });

  it('logs in with the right password and gives the same error for a wrong password and an unknown user', async () => {
    expect((await post('/api/v1/auth/login', { email, password })).statusCode).toBe(200);
    const wrong = await post('/api/v1/auth/login', { email, password: 'nope-nope-nope' });
    const unknown = await post('/api/v1/auth/login', { email: 'ghost@test.local', password });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body); // no account enumeration
  });

  it('uses the access token on protected routes and rejects garbage', async () => {
    const s = await login(app, email, password);
    expect((await s.req('GET', '/api/v1/users/me')).body).toMatchObject({ email, role: 'customer' });
    const bad = await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: { authorization: 'Bearer nonsense' } });
    expect(bad.statusCode).toBe(401);
  });

  it('rotates the refresh token: each cookie works exactly once', async () => {
    const first = await post('/api/v1/auth/login', { email, password });
    const c1 = refreshCookie(first)!;

    const second = await post('/api/v1/auth/refresh', undefined, c1);
    expect(second.statusCode).toBe(200);
    const c2 = refreshCookie(second)!;
    expect(c2).not.toBe(c1);
    expect(JSON.parse(second.body).accessToken).toBeTruthy();

    expect((await post('/api/v1/auth/refresh', undefined, c1)).statusCode).toBe(401); // replay of the old one
    expect((await post('/api/v1/auth/refresh', undefined, c2)).statusCode).toBe(200);
    expect((await post('/api/v1/auth/refresh')).statusCode).toBe(401); // no cookie at all
    expect((await post('/api/v1/auth/refresh', undefined, 'garbage')).statusCode).toBe(401);
  });

  it('logout revokes every refresh token (all devices)', async () => {
    const a = await post('/api/v1/auth/login', { email, password });
    const b = await post('/api/v1/auth/login', { email, password });
    const token = JSON.parse(a.body).accessToken;
    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { authorization: `Bearer ${token}` } });
    expect(out.statusCode).toBe(200);
    expect((await post('/api/v1/auth/refresh', undefined, refreshCookie(a)!)).statusCode).toBe(401);
    expect((await post('/api/v1/auth/refresh', undefined, refreshCookie(b)!)).statusCode).toBe(401);
    expect((await post('/api/v1/auth/logout')).statusCode).toBe(401);
  });

  it('changes the password, checks the current one, and ends other sessions', async () => {
    const s = await login(app, email, password);
    const other = await post('/api/v1/auth/login', { email, password });

    expect((await s.req('PATCH', '/api/v1/users/me/password', { currentPassword: 'wrong', newPassword: 'second-password-2' })).status).toBe(401);
    expect((await s.req('PATCH', '/api/v1/users/me/password', { currentPassword: password, newPassword: 'short' })).status).toBe(400);
    expect((await s.req('PATCH', '/api/v1/users/me/password', { currentPassword: password, newPassword: 'second-password-2' })).status).toBe(200);

    expect((await post('/api/v1/auth/login', { email, password })).statusCode).toBe(401);
    expect((await post('/api/v1/auth/login', { email, password: 'second-password-2' })).statusCode).toBe(200);
    expect((await post('/api/v1/auth/refresh', undefined, refreshCookie(other)!)).statusCode).toBe(401);
  });

  describe('refresh token scaling and safety', () => {
    const secret = () => new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);
    const userIdOf = async (e: string) => (await prisma.user.findUniqueOrThrow({ where: { email: e } })).id;
    const fakeRows = (userId: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `fake-${userId}-${Date.now()}-${i}`,
        userId,
        tokenHash: `not-a-real-hash-${i}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      }));

    it('redeems a token with a single lookup — speed does not depend on how many sessions exist', async () => {
      const e = `auth-scale-${Date.now()}@test.local`;
      await post('/api/v1/auth/register', { email: e, password, name: 'Scale Test' });
      const cookie = refreshCookie(await post('/api/v1/auth/login', { email: e, password }))!;
      // Simulate a user with hundreds of live sessions (previously: one argon2 verify per session per refresh).
      await prisma.refreshToken.createMany({ data: fakeRows(await userIdOf(e), 300) });

      const started = Date.now();
      const res = await post('/api/v1/auth/refresh', undefined, cookie);
      const took = Date.now() - started;
      expect(res.statusCode).toBe(200);
      expect(took, `refresh took ${took}ms with 300+ live sessions`).toBeLessThan(750);
    });

    it('lets exactly one of two simultaneous refreshes with the same cookie succeed', async () => {
      const cookie = refreshCookie(await post('/api/v1/auth/login', { email, password: 'second-password-2' }))!;
      const [a, b] = await Promise.all([post('/api/v1/auth/refresh', undefined, cookie), post('/api/v1/auth/refresh', undefined, cookie)]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 401]);
    });

    it('caps the number of signed-in devices and prunes stale sessions on login', async () => {
      const e = `auth-cap-${Date.now()}@test.local`;
      await post('/api/v1/auth/register', { email: e, password, name: 'Cap Test' });
      const userId = await userIdOf(e);
      await prisma.refreshToken.createMany({ data: fakeRows(userId, 40) });
      await prisma.refreshToken.create({
        data: { id: `stale-${userId}`, userId, tokenHash: 'x', expiresAt: new Date(Date.now() - 1000) }, // already expired
      });

      await post('/api/v1/auth/login', { email: e, password });
      const live = await prisma.refreshToken.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });
      expect(live).toBeLessThanOrEqual(20);
      expect(await prisma.refreshToken.count({ where: { id: `stale-${userId}` } })).toBe(0);
    });

    it('rejects old-format tokens (no jti), tampered tokens, and tokens for other users', async () => {
      const userId = await userIdOf(email);
      const legacy = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('7d').sign(secret());
      expect((await post('/api/v1/auth/refresh', undefined, legacy)).statusCode).toBe(401);

      // A validly-signed token that reuses a real row's jti but isn't the token that was issued.
      const real = refreshCookie(await post('/api/v1/auth/login', { email, password: 'second-password-2' }))!;
      const jti = JSON.parse(Buffer.from(real.split('.')[1]!, 'base64url').toString()).jti as string;
      const forged = await new SignJWT({ x: 1 }).setProtectedHeader({ alg: 'HS256' }).setJti(jti).setSubject(userId).setIssuedAt().setExpirationTime('7d').sign(secret());
      expect((await post('/api/v1/auth/refresh', undefined, forged)).statusCode).toBe(401);

      // Someone else's id on a real jti.
      const other = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setJti(jti).setSubject(await userIdOf(ACCOUNTS.customer2)).setIssuedAt().setExpirationTime('7d').sign(secret());
      expect((await post('/api/v1/auth/refresh', undefined, other)).statusCode).toBe(401);

      expect((await post('/api/v1/auth/refresh', undefined, real)).statusCode).toBe(200); // the genuine one still works
    });
  });

  describe('deactivated accounts', () => {
    it('cannot log in, cannot refresh, and cannot act even with a still-valid access token', async () => {
      const owner = await login(app, ACCOUNTS.owner);
      const created = await owner.req('POST', '/api/v1/admin/users', {
        email: `auth-staff-${Date.now()}@test.local`,
        name: 'Soon Gone',
        role: 'staff',
        temporaryPassword: 'temporary-pass-1',
      });
      expect(created.status).toBe(201);
      const staff = await login(app, created.body.email, 'temporary-pass-1');
      const refresh = refreshCookie(await post('/api/v1/auth/login', { email: created.body.email, password: 'temporary-pass-1' }))!;
      expect((await staff.req('GET', '/api/v1/orders')).status).toBe(200); // staff default: orders.view

      expect((await owner.req('PATCH', `/api/v1/admin/users/${created.body.id}/status`, { isActive: false })).status).toBe(200);

      expect((await post('/api/v1/auth/login', { email: created.body.email, password: 'temporary-pass-1' })).statusCode).toBe(401);
      expect((await post('/api/v1/auth/refresh', undefined, refresh)).statusCode).toBe(401);
      // The access token is still cryptographically valid for ~15 minutes,
      // but order actions re-check the account state on every call.
      expect((await staff.req('GET', '/api/v1/orders/does-not-matter')).status).toBe(403);
    });
  });

  describe('permissions', () => {
    it('keeps customers out of admin and staff routes', async () => {
      const c = await login(app, ACCOUNTS.customer1);
      expect((await c.req('GET', '/api/v1/admin/users')).status).toBe(403);
      expect((await c.req('GET', '/api/v1/orders')).status).toBe(403);
      expect((await c.req('GET', '/api/v1/menu/admin')).status).toBe(403);
      expect((await c.req('PATCH', '/api/v1/restaurant', { isOpen: false })).status).toBe(403);
      expect((await c.req('GET', '/api/v1/delivery/partners')).status).toBe(403);
    });

    it('gives each seeded role exactly its permissions', async () => {
      const perms = async (e: string) => ((await (await login(app, e)).req('GET', '/api/v1/users/me')).body.permissions as string[]).sort();
      expect(await perms(ACCOUNTS.customer1)).toEqual([]);
      expect(await perms(ACCOUNTS.delivery1)).toEqual(['delivery.fulfill']);
      expect(await perms(ACCOUNTS.staffOrders)).toEqual(['orders.manage', 'orders.view']);
      expect(await perms(ACCOUNTS.staffMenu)).toEqual(['delivery.assign', 'menu.manage', 'orders.manage', 'orders.view']);
      expect(await perms(ACCOUNTS.staffSupport)).toEqual(['orders.view', 'support.manage']);
      expect((await perms(ACCOUNTS.owner)).length).toBe(9);
    });
  });
});

void DEV_PASSWORD;
