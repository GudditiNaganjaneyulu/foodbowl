import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SignJWT, jwtVerify } from 'jose';
import { UPLOAD_BUCKETS, type UploadBucket } from '@foodbowl/shared';
import { env } from '../../config/env';
import type { SignedUpload, StorageProvider, UploadContext } from './index';

/** Where built-in storage keeps its files. Mount a volume here in Docker to survive redeploys. */
export const uploadRoot = () => path.resolve(env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'));

const TOKEN_TTL = '10m';
// A separate secret from login tokens: an upload token can never be replayed as an access token or vice versa.
const secret = () => new TextEncoder().encode(`${env.JWT_ACCESS_SECRET}:local-upload`);

export function isBucket(value: string): value is UploadBucket {
  return (UPLOAD_BUCKETS as readonly string[]).includes(value);
}

/**
 * Resolves `<root>/<bucket>/<path>` and refuses anything that escapes the
 * bucket folder ("..", absolute paths, encoded slashes) — returns null instead
 * of ever touching a path outside the upload root.
 */
export function resolveStoragePath(bucket: string, relativePath: string): string | null {
  if (!isBucket(bucket) || !relativePath || relativePath.includes('\0')) return null;
  const base = path.join(uploadRoot(), bucket);
  const full = path.resolve(base, relativePath);
  return full.startsWith(base + path.sep) ? full : null;
}

export async function signLocalUploadToken(bucket: string, filePath: string): Promise<string> {
  return new SignJWT({ bucket, path: filePath }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(TOKEN_TTL).sign(secret());
}

/** True only if `token` was issued for exactly this bucket and path, and hasn't expired. */
export async function verifyLocalUploadToken(token: string, bucket: string, filePath: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.bucket === bucket && payload.path === filePath;
  } catch {
    return false;
  }
}

/** API-relative public path; the web app prefixes the API's address (env-independent to store). */
export const localPublicPath = (bucket: string, filePath: string) => `/files/${bucket}/${filePath}`;

/**
 * Fallback storage on the API's own disk, used when Supabase isn't configured
 * so photo features (menu photos, delivery proof) work out of the box.
 * Files are served publicly by routes/files; treat the folder as a bucket.
 */
export class LocalStorageProvider implements StorageProvider {
  publicUrl(bucket: UploadBucket, filePath: string): string {
    return localPublicPath(bucket, filePath);
  }

  async createSignedUpload(bucket: UploadBucket, filePath: string, ctx: UploadContext): Promise<SignedUpload> {
    const token = await signLocalUploadToken(bucket, filePath);
    return {
      uploadUrl: `${ctx.baseUrl}/api/v1/uploads/local/${bucket}/${filePath}?token=${encodeURIComponent(token)}`,
      encoding: 'raw',
      token,
      path: filePath,
      publicUrl: localPublicPath(bucket, filePath),
    };
  }

  async upload(bucket: UploadBucket, filePath: string, data: Buffer) {
    const target = resolveStoragePath(bucket, filePath);
    if (!target) throw new Error('Invalid storage path');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return { path: filePath, publicUrl: localPublicPath(bucket, filePath) };
  }
}
