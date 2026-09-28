/**
 * Bootstraps OpenTelemetry. MUST be the first thing loaded in the process —
 * imported via `--import` in the dev/start scripts, never imported from
 * elsewhere in app code. Auto-instruments Fastify/HTTP/pg for traces; custom
 * spans and metrics are added at service boundaries (see lib/otel.ts,
 * modules/orders/order.service.ts, modules/menu/menu.routes.ts).
 *
 * Tool-agnostic on purpose: this only knows how to speak OTLP. Point
 * OTEL_EXPORTER_OTLP_ENDPOINT at the local Jaeger/otel-collector for dev, or
 * at any OTLP-compatible backend later — nothing here changes.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'foodbowl-api';

const sdk = new NodeSDK({
  resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
  traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
  // Custom counters/histograms (lib/otel.ts's `meter`) export on this same
  // interval; the collector needs a `metrics` pipeline too (see
  // infra/otel-collector-config.yaml) or these are silently dropped.
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${otlpEndpoint}/v1/metrics` }),
    exportIntervalMillis: 15_000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Filesystem instrumentation is extremely noisy for a web API; skip it.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
