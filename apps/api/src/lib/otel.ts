/**
 * Shared OpenTelemetry handles — one tracer/meter for the whole app, plus the
 * `withSpan` wrapper every module uses to add a custom span at a service
 * boundary (on top of the automatic HTTP/Fastify/pg spans from tracing.ts).
 * Safe to import from anywhere; tracing.ts (loaded first, via --import) is
 * what actually starts the SDK and makes these do something.
 */
import { SpanStatusCode, trace, metrics } from '@opentelemetry/api';

export const tracer = trace.getTracer('foodbowl-api');
export const meter = metrics.getMeter('foodbowl-api');

/** Runs `fn` inside a span, recording failures on it, and always ends the span. */
export async function withSpan<T>(name: string, attributes: Record<string, string | number>, fn: () => Promise<T>) {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
