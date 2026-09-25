import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  MAX_UPLOAD_BYTES,
  PERMISSIONS,
  signUploadSchema,
  type SignedUploadDTO,
  type UploadBucket,
} from '@foodbowl/shared';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import { getActor } from '../../lib/rbac';
import { getStorage } from '../../lib/storage';
import { EXTENSION_FOR, TYPE_FOR_EXTENSION, detectImageType } from '../../lib/storage/image-type';
import { LocalStorageProvider, isBucket, resolveStoragePath, verifyLocalUploadToken } from '../../lib/storage/local';
import { requireAuth } from '../../plugins/auth';
import { signUploadDocs } from './upload.docs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Which permission may upload into which bucket. Avatars need only a login. */
const BUCKET_PERMISSION: Record<UploadBucket, string | null> = {
  'menu-images': PERMISSIONS.MENU_MANAGE,
  'restaurant-assets': PERMISSIONS.RESTAURANT_MANAGE,
  'delivery-proofs': PERMISSIONS.DELIVERY_FULFILL,
  'user-avatars': null,
};

export default async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post('/sign', { schema: signUploadDocs, preHandler: requireAuth }, async (request): Promise<SignedUploadDTO> => {
    const body = signUploadSchema.parse(request.body);
    const actor = await getActor(request.user!.sub);

    const required = BUCKET_PERMISSION[body.bucket];
    if (required && !actor.permissions.has(required)) {
      throw new HttpError(`Missing permission: ${required}`, 403);
    }

    const storage = getStorage();
    if (!storage) throw new HttpError('File storage is not configured on this server', 503);

    // A user's own avatar always lives under their id, whatever the client asked for.
    const folder = body.bucket === 'user-avatars' ? actor.userId : (body.entityId ?? 'misc');
    const filePath = `${folder}/${randomUUID()}.${EXTENSION_FOR[body.contentType]}`;
    const baseUrl = env.PUBLIC_API_URL ?? `${request.protocol}://${request.headers.host}`;
    const signed = await storage.createSignedUpload(body.bucket, filePath, { baseUrl });
    return { ...signed, bucket: body.bucket, maxBytes: MAX_UPLOAD_BYTES };
  });

  /**
   * Receives the file for built-in storage. The signed token in the query is the
   * only credential (it is bound to this exact bucket + path and expires in
   * 10 minutes), so this route has no login requirement — the browser is
   * following a URL that /sign handed it. Not documented in Swagger on purpose.
   */
  fastify.put(
    '/local/:bucket/*',
    { schema: { hide: true } },
    async (request, reply) => {
      if (!(getStorage() instanceof LocalStorageProvider)) throw new HttpError('Not found', 404);
      const { bucket, '*': filePath } = request.params as { bucket: string; '*': string };
      const { token } = request.query as { token?: string };

      if (!isBucket(bucket) || !token || !(await verifyLocalUploadToken(token, bucket, filePath))) {
        throw new HttpError('This upload link is invalid or has expired', 403);
      }
      const target = resolveStoragePath(bucket, filePath);
      if (!target) throw new HttpError('Invalid path', 400);

      const bytes = request.body;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new HttpError('Send the image as the request body', 400);
      if (bytes.length > MAX_UPLOAD_BYTES) throw new HttpError('That image is too large', 413);

      // Trust the bytes, not the headers: it must really be an image, of the type the path promises.
      const actual = detectImageType(bytes);
      const promised = TYPE_FOR_EXTENSION[path.extname(filePath).slice(1).toLowerCase()];
      if (!actual || actual !== promised) throw new HttpError('That file is not a valid JPEG, PNG or WebP image', 400);

      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return reply.code(200).send({ ok: true, path: filePath, publicUrl: `/files/${bucket}/${filePath}` });
    },
  );
}
