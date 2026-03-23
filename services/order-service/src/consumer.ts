import { context, propagation, trace } from '@opentelemetry/api'
import { createLogger } from '@konnect-demo/shared'
import { consumer } from './kafka.js'
import { prisma } from './db.js'

const log = createLogger('order-service')
const tracer = trace.getTracer('order-service')

export async function startConsumer() {
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      // Extract trace context from Kafka headers
      const carrier: Record<string, string> = {}
      for (const [key, value] of Object.entries(message.headers || {})) {
        carrier[key] = value?.toString() || ''
      }
      log.info({ kafkaHeaders: carrier }, 'Received Kafka message headers')
      const parentContext = propagation.extract(context.active(), carrier)

      await context.with(parentContext, async () => {
        const span = tracer.startSpan(`${topic} process`, undefined, parentContext)
        try {
          const value = message.value?.toString()
          if (!value) return

          const event = JSON.parse(value)
          log.info({ topic, event }, 'Received event')

          if (topic === 'order.status-updated') {
            if (!event.orderId || !event.status) {
              log.error('Invalid order.status-updated event: missing orderId or status')
              return
            }
            await prisma.order.update({
              where: { id: event.orderId },
              data: { status: event.status },
            })
            log.info({ orderId: event.orderId, status: event.status }, 'Order status updated')
          }
        } catch (err) {
          span.recordException(err as Error)
          log.error({ err }, 'Error processing message')
        } finally {
          span.end()
        }
      })
    },
  })
}
