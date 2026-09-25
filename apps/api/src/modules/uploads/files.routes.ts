import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../../lib/http-error';
import { TYPE_FOR_EXTENSION } from '../../lib/storage/image-type';
import { resolveStoragePath } from '../../lib/storage/local';

/**
 * Public read access to files held by built-in storage (`GET /files/<bucket>/<path>`).
 * Only image files inside a known bucket folder are ever served; everything
 * else is a plain 404. Names are unguessable UUIDs (or fixed seed names).
 */
export default async function fileRoutes(fastify: FastifyInstance) {
  fastify.get('/:bucket/*', { schema: { hide: true } }, async (request, reply) => {
    const { bucket, '*': filePath } = request.params as { bucket: string; '*': string };
    const type = TYPE_FOR_EXTENSION[path.extname(filePath).slice(1).toLowerCase()];
    const full = type ? resolveStoragePath(bucket, filePath) : null;
    const info = full ? await stat(full).catch(() => null) : null;
    if (!full || !info?.isFile()) throw new HttpError('Not found', 404);

    return reply
      .type(type!)
      .header('Cache-Control', 'public, max-age=86400')
      .header('X-Content-Type-Options', 'nosniff')
      // Even if a browser were tricked into treating this as a document, it can run nothing.
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox")
      // Photos are embedded from the web app's origin, so allow cross-origin embedding.
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(createReadStream(full));
  });
}
