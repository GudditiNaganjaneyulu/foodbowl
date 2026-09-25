import type { FastifySchema } from 'fastify';
import { signUploadSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod } from '../../lib/openapi';

const description = [
  'Returns a short-lived pre-authorized upload URL so the browser sends the file **directly to storage**.',
  'After uploading, store the returned `publicUrl` on the entity (menu item `imageUrl`, delivery `proofImageUrl`, …).',
  'Images only (JPEG/PNG/WebP), up to 5 MB.',
  '',
  'Who may upload where: `menu-images` needs `menu.manage`; `restaurant-assets` needs `restaurant.manage`; `delivery-proofs` needs `delivery.fulfill`; `user-avatars` needs only a login.',
  'Buckets are assumed to be **public-read**; file names are random UUIDs.',
  '',
  '**How to send the file** — see `encoding` in the response:',
  '- `multipart` (Supabase): a multipart form PUT with the file in an unnamed field (what supabase-js `uploadToSignedUrl` does).',
  "- `raw` (built-in storage, used when Supabase isn't configured): a PUT with the image bytes as the body and the image's own `Content-Type`.",
  "The server checks the file's real signature, so only genuine JPEG/PNG/WebP files are accepted.",
  'With built-in storage, `publicUrl` is an API-relative `/files/…` path.',
].join('\n');

export const signUploadDocs: FastifySchema = {
  tags: ['Uploads'],
  summary: 'Get a signed URL to upload an image',
  description,
  security: bearerAuth,
  body: fromZod(signUploadSchema, { example: { bucket: 'menu-images', contentType: 'image/jpeg', entityId: 'seed-item-0-0' } }),
  response: {
    200: {
      description: 'A signed upload.',
      type: 'object',
      properties: {
        uploadUrl: { type: 'string', description: 'PUT the file here.' },
        encoding: { type: 'string', enum: ['multipart', 'raw'], description: 'How to send the file.' },
        token: { type: 'string' },
        path: { type: 'string', example: 'seed-item-0-0/3f2b….jpg' },
        publicUrl: { type: 'string', description: 'Store this on the entity once the upload succeeds.' },
        bucket: { type: 'string' },
        maxBytes: { type: 'integer', example: 5242880 },
      },
    },
    ...errorResponses({
      400: 'Validation failed (unknown bucket, or not a JPEG/PNG/WebP).',
      401: 'Missing, invalid or expired access token.',
      403: 'You may not upload to this bucket.',
      503: 'Storage is disabled on this server.',
    }),
  },
};
