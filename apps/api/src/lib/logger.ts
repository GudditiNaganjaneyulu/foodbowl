import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { env } from '../config/env';

/**
 * Every log line carries trace_id/span_id from the active OTel context (when
 * one exists) so logs and traces can be joined in whatever backend we pick
 * later — this is the log/trace correlation piece, not an optional extra.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  mixin() {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    return { trace_id: ctx.traceId, span_id: ctx.spanId };
  },
});
