import { createClient } from '@supabase/supabase-js';
import type { UploadBucket } from '@foodbowl/shared';
import { env } from '../../config/env';
import { LocalStorageProvider } from './local';

export interface SignedUpload {
  uploadUrl: string;
  /** How the browser must send the file — see SignedUploadDTO. */
  encoding: 'multipart' | 'raw';
  token: string;
  path: string;
  publicUrl: string;
}

export interface UploadContext {
  /** This API's public origin (for providers that receive uploads themselves). */
  baseUrl: string;
}

/**
 * The only thing the app needs from file storage (BUILD_PROMPT.md §7).
 * `createSignedUpload` lets a browser send a file straight to storage with a
 * short-lived pre-authorised URL; `upload` is for the server itself (seeding).
 * Swapping Supabase for S3/R2 means a new class implementing this, nothing else.
 */
export interface StorageProvider {
  /** Where a stored file is publicly readable (pure string; does not check the file exists). */
  publicUrl(bucket: UploadBucket, path: string): string;
  createSignedUpload(bucket: UploadBucket, path: string, ctx: UploadContext): Promise<SignedUpload>;
  upload(bucket: UploadBucket, path: string, data: Buffer, contentType: string): Promise<{ path: string; publicUrl: string }>;
}

class SupabaseStorageProvider implements StorageProvider {
  private readonly client;

  constructor(url: string, serviceRoleKey: string) {
    // Service-role key: backend only, never sent to the browser.
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  publicUrl(bucket: UploadBucket, path: string): string {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async createSignedUpload(bucket: UploadBucket, path: string): Promise<SignedUpload> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Supabase could not sign an upload: ${error?.message ?? 'unknown error'}`);
    const { data: pub } = this.client.storage.from(bucket).getPublicUrl(data.path);
    return { uploadUrl: data.signedUrl, encoding: 'multipart', token: data.token, path: data.path, publicUrl: pub.publicUrl };
  }

  async upload(bucket: UploadBucket, path: string, data: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(bucket).upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed (${bucket}/${path}): ${error.message}`);
    const { data: pub } = this.client.storage.from(bucket).getPublicUrl(path);
    return { path, publicUrl: pub.publicUrl };
  }
}

let provider: StorageProvider | null =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseStorageProvider(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : new LocalStorageProvider();

/** Supabase when configured, otherwise the API's own disk. Null only if disabled via setStorageProvider(null). */
export const getStorage = () => provider;

export const usingSupabase = () => !(provider instanceof LocalStorageProvider) && provider !== null;

/** Test seam: install a fake provider (or null to simulate "storage disabled"). */
export function setStorageProvider(next: StorageProvider | null) {
  provider = next;
}
