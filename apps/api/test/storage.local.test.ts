import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MAX_UPLOAD_BYTES, type SignedUploadDTO } from '@foodbowl/shared';
import { LocalStorageProvider, signLocalUploadToken, uploadRoot } from '../src/lib/storage/local';
import { setStorageProvider } from '../src/lib/storage';
import { deleteSince } from './cleanup';
import { ACCOUNTS, describeDb, login, type Session } from './helpers';

// Smallest valid-signature files (the server checks signatures, not full decodability).
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF-test-image-bytes')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-test')]);

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let menu: Session, rider: Session, c1: Session;
const startedAt = new Date();

const pathOf = (url: string) => {
  const u = new URL(url, 'http://x');
  return u.pathname + u.search;
};
const put = (url: string, body: Buffer | string, type = 'image/jpeg') =>
  app.inject({ method: 'PUT', url: pathOf(url), headers: { 'content-type': type }, payload: body });
const sign = (s: Session, body: object) => s.req('POST', '/api/v1/uploads/sign', body);

describeDb('built-in file storage (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    app = await buildApp();
    await app.ready();
    setStorageProvider(new LocalStorageProvider());
    [menu, rider, c1] = await Promise.all([login(app, ACCOUNTS.staffMenu), login(app, ACCOUNTS.delivery1), login(app, ACCOUNTS.customer1)]);
  });

  afterAll(async () => {
    await deleteSince(prisma, startedAt);
    await app.close();
    rmSync(uploadRoot(), { recursive: true, force: true });
  });

  it('signs an upload that sends raw bytes and returns an API-relative public path', async () => {
    const res = await sign(menu, { bucket: 'menu-images', contentType: 'image/jpeg', entityId: 'item-1' });
    expect(res.status).toBe(200);
    const s = res.body as SignedUploadDTO;
    expect(s.encoding).toBe('raw');
    expect(s.publicUrl).toMatch(/^\/files\/menu-images\/item-1\/[0-9a-f-]{36}\.jpg$/);
    expect(s.uploadUrl).toContain('/api/v1/uploads/local/menu-images/item-1/');
  });

  it('round trip: upload the file, then read it back publicly with safe headers', async () => {
    const s = (await sign(rider, { bucket: 'delivery-proofs', contentType: 'image/jpeg', entityId: 'order-9' })).body as SignedUploadDTO;
    const up = await put(s.uploadUrl, JPEG);
    expect(up.statusCode, up.body).toBe(200);
    expect(JSON.parse(up.body)).toMatchObject({ ok: true, publicUrl: s.publicUrl });

    const got = await app.inject({ method: 'GET', url: s.publicUrl }); // no auth: public read
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.rawPayload.equals(JPEG)).toBe(true);
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(got.headers['content-security-policy']).toMatch(/default-src 'none'/);
    expect(got.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('accepts PNG when the path says .png', async () => {
    const s = (await sign(menu, { bucket: 'menu-images', contentType: 'image/png' })).body as SignedUploadDTO;
    expect((await put(s.uploadUrl, PNG, 'image/png')).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: s.publicUrl })).headers['content-type']).toBe('image/png');
  });

  it('refuses uploads without a valid token, or with a token for a different file', async () => {
    const a = (await sign(menu, { bucket: 'menu-images', contentType: 'image/jpeg' })).body as SignedUploadDTO;
    const b = (await sign(menu, { bucket: 'menu-images', contentType: 'image/jpeg' })).body as SignedUploadDTO;
    const noToken = pathOf(a.uploadUrl).split('?')[0]!;
    expect((await put(noToken, JPEG)).statusCode).toBe(403);
    expect((await put(`${noToken}?token=garbage`, JPEG)).statusCode).toBe(403);
    // b's token on a's path
    const bToken = new URL(b.uploadUrl).searchParams.get('token')!;
    expect((await put(`${noToken}?token=${encodeURIComponent(bToken)}`, JPEG)).statusCode).toBe(403);
    // Nothing was written.
    expect((await app.inject({ method: 'GET', url: a.publicUrl })).statusCode).toBe(404);
  });

  it('refuses files that are not really the promised image type, whatever the Content-Type claims', async () => {
    const s = (await sign(menu, { bucket: 'menu-images', contentType: 'image/jpeg' })).body as SignedUploadDTO;
    for (const bad of [Buffer.from('<html><script>alert(1)</script></html>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), PNG /* a PNG on a .jpg path */]) {
      const res = await put(s.uploadUrl, bad, 'image/jpeg');
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/not a valid JPEG, PNG or WebP/);
    }
    expect((await app.inject({ method: 'GET', url: s.publicUrl })).statusCode).toBe(404);
  });

  it('refuses empty and oversized bodies', async () => {
    const s = (await sign(menu, { bucket: 'menu-images', contentType: 'image/jpeg' })).body as SignedUploadDTO;
    expect((await put(s.uploadUrl, Buffer.alloc(0))).statusCode).toBe(400);
    const tooBig = Buffer.concat([JPEG, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    expect((await put(s.uploadUrl, tooBig)).statusCode).toBe(413);
    expect((await app.inject({ method: 'GET', url: s.publicUrl })).statusCode).toBe(404);
  });

  it('refuses a token that has been bound to a traversal path', async () => {
    const evil = 'menu-images/../delivery-proofs/x.jpg';
    const token = await signLocalUploadToken('menu-images', '../delivery-proofs/x.jpg');
    const res = await put(`/api/v1/uploads/local/menu-images/..%2Fdelivery-proofs%2Fx.jpg?token=${encodeURIComponent(token)}`, JPEG);
    expect([400, 403, 404]).toContain(res.statusCode);
    expect((await app.inject({ method: 'GET', url: `/files/${evil}` })).statusCode).toBe(404);
  });

  it('only serves images from known buckets — no traversal, no other file types, no unknown buckets', async () => {
    const s = (await sign(menu, { bucket: 'menu-images', contentType: 'image/jpeg', entityId: 'safe' })).body as SignedUploadDTO;
    await put(s.uploadUrl, JPEG);
    for (const url of [
      '/files/menu-images/../../../../etc/passwd',
      '/files/menu-images/..%2F..%2Fetc%2Fpasswd',
      '/files/menu-images/%2e%2e/%2e%2e/etc/passwd.jpg',
      '/files/secrets/x.jpg',
      '/files/menu-images/safe/notes.txt',
      '/files/menu-images/safe',
      '/files/menu-images/',
      '/files/menu-images/nonexistent.jpg',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
  });

  it('a customer still cannot sign uploads to staff-only buckets', async () => {
    expect((await sign(c1, { bucket: 'menu-images', contentType: 'image/jpeg' })).status).toBe(403);
    expect((await sign(c1, { bucket: 'delivery-proofs', contentType: 'image/jpeg' })).status).toBe(403);
    expect((await sign(c1, { bucket: 'user-avatars', contentType: 'image/jpeg' })).status).toBe(200);
  });
});
