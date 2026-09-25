// MUST be the first import in the whole process: it registers OpenTelemetry's
// module-patching hooks before anything it instruments (fastify, pg, http)
// gets loaded. Previously this ran via `tsx --import ./lib/tracing.ts`, but
// tsx's watch mode runs the app in a worker thread and doesn't reliably
// forward that flag's TypeScript loading to it (ERR_UNKNOWN_FILE_EXTENSION
// under Docker/Linux, even though it worked directly on the host) — a plain
// first-line import has no such dependency on CLI flag propagation.
import './lib/tracing';
import { env } from './config/env';
import { logger } from './lib/logger';
import { buildApp } from './app';

const fastify = await buildApp();

fastify
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => logger.info({ port: env.PORT }, `foodbowl-api listening`))
  .catch((err) => {
    logger.error(err, 'failed to start server');
    process.exit(1);
  });
