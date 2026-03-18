import { registerOTel } from '@vercel/otel'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

export function register() {
  const exporter = new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'}/v1/traces`,
  })

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'frontend',
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        scheduledDelayMillis: 1000,
        maxExportBatchSize: 128,
      }),
    ],
  })
}
