import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setStorageProvider } from '../src/lib/storage';
import { deleteSince } from './cleanup';
import { ACCOUNTS, describeDb, login, type Session } from './helpers';

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let owner: Session, menu: Session, rider: Session, c1: Session;
const startedAt = new Date();
const signed: { bucket: string; path: string }[] = [];

const sign = (s: Session, body: object) => s.req('POST', '/api/v1/uploads/sign', body);

describeDb('signed uploads (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    app = await buildApp();
    await app.ready();
    [owner, menu, rider, c1] = await Promise.all([
      login(app, ACCOUNTS.owner), login(app, ACCOUNTS.staffMenu), login(app, ACCOUNTS.delivery1), login(app, ACCOUNTS.customer1),
    ]);
    // A fake provider: no Supabase credentials are needed to test our rules.
    setStorageProvider({
      publicUrl: (bucket, path) => `https://fake.test/public/${bucket}/${path}`,
      async createSignedUpload(bucket, path) {
        signed.push({ bucket, path });
        return { uploadUrl: `https://fake.test/upload/${bucket}/${path}?token=t`, encoding: 'multipart', token: 't', path, publicUrl: `https://fake.test/public/${bucket}/${path}` };
      },
      async upload(bucket, path) {
        return { path, publicUrl: `https://fake.test/public/${bucket}/${path}` };
      },
    });
  });

  afterAll(async () => {
    setStorageProvider(null);
    await deleteSince(prisma, startedAt);
    await app.close();
  });

  it('requires a login', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/uploads/sign', payload: { bucket: 'menu-images', contentType: 'image/png' } });
    expect(res.statusCode).toBe(401);
  });

  it('gates each bucket on the right permission', async () => {
    const png = { contentType: 'image/png' };
    expect((await sign(c1, { bucket: 'menu-images', ...png })).status).toBe(403);
    expect((await sign(menu, { bucket: 'menu-images', ...png })).status).toBe(200);
    expect((await sign(menu, { bucket: 'restaurant-assets', ...png })).status).toBe(403); // menu.manage ≠ restaurant.manage
    expect((await sign(owner, { bucket: 'restaurant-assets', ...png })).status).toBe(200);
    expect((await sign(c1, { bucket: 'delivery-proofs', ...png })).status).toBe(403);
    expect((await sign(rider, { bucket: 'delivery-proofs', ...png })).status).toBe(200);
    expect((await sign(c1, { bucket: 'user-avatars', ...png })).status).toBe(200);
  });

  it('returns a random path under the entity, with the right extension and public URL', async () => {
    const a = await sign(menu, { bucket: 'menu-images', contentType: 'image/jpeg', entityId: 'seed-item-0-0' });
    const b = await sign(menu, { bucket: 'menu-images', contentType: 'image/webp', entityId: 'seed-item-0-0' });
    expect(a.body.path).toMatch(/^seed-item-0-0\/[0-9a-f-]{36}\.jpg$/);
    expect(b.body.path).toMatch(/\.webp$/);
    expect(a.body.path).not.toBe(b.body.path);
    expect(a.body).toMatchObject({ bucket: 'menu-images', maxBytes: 5 * 1024 * 1024, token: 't' });
    expect(a.body.publicUrl).toBe(`https://fake.test/public/menu-images/${a.body.path}`);
    expect((await sign(menu, { bucket: 'menu-images', contentType: 'image/png' })).body.path).toMatch(/^misc\//);
  });

  it("always files an avatar under the caller's own id, whatever they ask for", async () => {
    const res = await sign(c1, { bucket: 'user-avatars', contentType: 'image/png', entityId: 'someone-else' });
    expect(res.body.path.startsWith(`${c1.userId}/`)).toBe(true);
  });

  it('accepts images only, known buckets only, and safe entity ids only', async () => {
    expect((await sign(menu, { bucket: 'menu-images', contentType: 'application/pdf' })).status).toBe(400);
    expect((await sign(menu, { bucket: 'menu-images', contentType: 'image/svg+xml' })).status).toBe(400); // SVG can carry scripts
    expect((await sign(menu, { bucket: 'secrets', contentType: 'image/png' })).status).toBe(400);
    expect((await sign(menu, { bucket: 'menu-images', contentType: 'image/png', entityId: '../../etc' })).status).toBe(400);
    expect((await sign(menu, { bucket: 'menu-images', contentType: 'image/png', entityId: 'a/b' })).status).toBe(400);
    expect((await sign(menu, {})).status).toBe(400);
  });

  it('says 503 (not a crash) when storage is not configured', async () => {
    setStorageProvider(null);
    const res = await sign(menu, { bucket: 'menu-images', contentType: 'image/png' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/);
    // Permission is checked first: someone who may not upload isn't told about server config.
    expect((await sign(c1, { bucket: 'menu-images', contentType: 'image/png' })).status).toBe(403);
  });
});
