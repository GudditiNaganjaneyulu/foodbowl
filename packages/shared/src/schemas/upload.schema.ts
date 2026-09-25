import { z } from 'zod';

export const UPLOAD_BUCKETS = ['menu-images', 'restaurant-assets', 'delivery-proofs', 'user-avatars'] as const;
export type UploadBucket = (typeof UPLOAD_BUCKETS)[number];

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const signUploadSchema = z.object({
  bucket: z.enum(UPLOAD_BUCKETS),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  /** Groups files by what they belong to (a menu item id, an order id). Optional. */
  entityId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Use letters, numbers, - and _ only')
    .optional(),
});
export type SignUploadInput = z.infer<typeof signUploadSchema>;

export interface SignedUploadDTO {
  /**
   * PUT the file here. `encoding` says how: 'multipart' (Supabase: a form with
   * the file in an unnamed field, exactly what supabase-js uploadToSignedUrl
   * sends) or 'raw' (built-in storage: the file bytes as the body, with the
   * image's own Content-Type).
   */
  uploadUrl: string;
  encoding: 'multipart' | 'raw';
  /** Token embedded in `uploadUrl`; also needed by supabase-js `uploadToSignedUrl`. */
  token: string;
  /** Storage path inside the bucket. */
  path: string;
  /**
   * Where the file will be publicly readable once uploaded — store THIS on the
   * entity. Absolute (Supabase) or, for built-in storage, an API-relative
   * "/files/…" path (the web app resolves it against the API address).
   */
  publicUrl: string;
  bucket: UploadBucket;
  maxBytes: number;
}
