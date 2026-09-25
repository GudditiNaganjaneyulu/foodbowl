import { describe, expect, it } from 'vitest';
import { detectImageType } from '../src/lib/storage/image-type';
import { resolveStoragePath, signLocalUploadToken, uploadRoot, verifyLocalUploadToken } from '../src/lib/storage/local';

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('detectImageType (trusts the bytes, not the label)', () => {
  it('recognises JPEG, PNG and WebP by their signatures', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(detectImageType(Uint8Array.from([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBPVP8 ')]))).toBe('image/webp');
  });

  it('refuses everything else — HTML, SVG, GIF, scripts, RIFF that is not WebP, and tiny inputs', () => {
    for (const nope of [
      ascii('<!doctype html><script>alert(1)</script>'),
      ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ascii('GIF89a......'),
      Uint8Array.from([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVEfmt ')]),
      bytes(0xff, 0xd8), // truncated JPEG signature
      bytes(),
    ]) {
      expect(detectImageType(nope)).toBeNull();
    }
  });
});

describe('resolveStoragePath (nothing escapes the bucket folder)', () => {
  it('resolves ordinary nested paths inside the bucket', () => {
    const p = resolveStoragePath('menu-images', 'seed/butter-chicken.jpg')!;
    expect(p.startsWith(uploadRoot())).toBe(true);
    expect(p.endsWith('menu-images/seed/butter-chicken.jpg')).toBe(true);
  });

  it('refuses traversal, absolute paths, NUL bytes, empty paths and unknown buckets', () => {
    for (const [bucket, path] of [
      ['menu-images', '../secrets.jpg'],
      ['menu-images', 'a/../../b.jpg'],
      ['menu-images', '../delivery-proofs/x.jpg'], // into a sibling bucket
      ['menu-images', '/etc/passwd'],
      ['menu-images', 'ok.jpg\0.png'],
      ['menu-images', ''],
      ['menu-images', '..'],
      ['not-a-bucket', 'x.jpg'],
      ['..', 'x.jpg'],
    ] as const) {
      expect(resolveStoragePath(bucket, path), `${bucket} ${JSON.stringify(path)}`).toBeNull();
    }
  });
});

describe('upload tokens', () => {
  it('are valid only for the exact bucket and path they were issued for', async () => {
    const token = await signLocalUploadToken('menu-images', 'item1/a.jpg');
    expect(await verifyLocalUploadToken(token, 'menu-images', 'item1/a.jpg')).toBe(true);
    expect(await verifyLocalUploadToken(token, 'menu-images', 'item1/b.jpg')).toBe(false);
    expect(await verifyLocalUploadToken(token, 'delivery-proofs', 'item1/a.jpg')).toBe(false);
  });

  it('reject garbage and tokens signed with another secret', async () => {
    expect(await verifyLocalUploadToken('garbage', 'menu-images', 'a.jpg')).toBe(false);
    expect(await verifyLocalUploadToken('', 'menu-images', 'a.jpg')).toBe(false);
    // A login access token must never be usable as an upload token.
    const { signAccessToken } = await import('../src/lib/tokens');
    const access = await signAccessToken({ sub: 'u1', role: 'customer', permVersion: 1 });
    expect(await verifyLocalUploadToken(access, 'menu-images', 'a.jpg')).toBe(false);
  });
});
