import { randomBytes } from 'node:crypto'
import { context, propagation, trace } from '@opentelemetry/api'
import { createLogger } from '@konnect-demo/shared'
import { consumer, producer } from './kafka.js'
import { prisma } from './db.js'

const log = createLogger('shipping-service')
const tracer = trace.getTracer('shipping-service')

function generateTrackingNumber(): string {
  return 'TRK-' + randomBytes(4).toString('hex').toUpperCase()
}

function injectTraceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  propagation.inject(context.active(), headers)
  return headers
}

export async function startConsumer() {
  await consumer.run({
    eachMessage: async ({ message }) => {
      // Extract trace context from Kafka headers
      const rawHeaders: Record<string, string> = {}
      for (const [key, value] of Object.entries(message.headers || {})) {
        rawHeaders[key] = value?.toString() || ''
      }
      log.info({ kafkaHeaders: rawHeaders }, 'Received Kafka message headers')
      const parentContext = propagation.extract(context.active(), rawHeaders)

      await context.with(parentContext, async () => {
        const span = tracer.startSpan('order.created process', undefined, parentContext)
        try {
          const value = message.value?.toString()
          if (!value) return

          const event = JSON.parse(value)
          log.info({ event }, 'Received order.created event')

          const { orderId, userId } = event
          if (!orderId || !userId) {
            log.error('Invalid order.created event: missing orderId or userId')
            return
          }

          const trackingNumber = generateTrackingNumber()

          const shipment = await prisma.shipment.create({
            data: {
              orderId,
              userId,
              status: 'PROCESSING',
              trackingNumber,
            },
          })

          log.info({ shipmentId: shipment.id, orderId }, 'Shipment created')

          // Publish order.status-updated -> CONFIRMED (with trace context)
          await producer.send({
            topic: 'order.status-updated',
            messages: [
              {
                key: orderId,
                value: JSON.stringify({
                  orderId,
                  status: 'CONFIRMED',
                  updatedAt: new Date().toISOString(),
                }),
                headers: injectTraceHeaders(),
              },
            ],
          })

          log.info({ orderId, status: 'CONFIRMED' }, 'Published order.status-updated')

          // Simulate shipping after 5 seconds
          setTimeout(async () => {
            // Create a follow-up span linked to the same trace
            const followUpSpan = tracer.startSpan('simulate shipping', undefined, parentContext)
            try {
              const shippedAt = new Date()

              await prisma.shipment.update({
                where: { id: shipment.id },
                data: {
                  status: 'SHIPPED',
                  shippedAt,
                },
              })

              log.info({ shipmentId: shipment.id }, 'Shipment updated to SHIPPED')

              // Inject trace context for the SHIPPED event
              const shippedHeaders: Record<string, string> = {}
              propagation.inject(trace.setSpan(context.active(), followUpSpan), shippedHeaders)

              await producer.send({
                topic: 'order.status-updated',
                messages: [
                  {
                    key: orderId,
                    value: JSON.stringify({
                      orderId,
                      status: 'SHIPPED',
                      trackingNumber,
                      updatedAt: shippedAt.toISOString(),
                    }),
                    headers: shippedHeaders,
                  },
                ],
              })

              log.info({ orderId, status: 'SHIPPED' }, 'Published order.status-updated')
            } catch (err) {
              followUpSpan.recordException(err as Error)
              log.error({ err, orderId }, 'Failed to update shipment to SHIPPED')
            } finally {
              followUpSpan.end()
            }
          }, 5000)
        } catch (err) {
          span.recordException(err as Error)
          log.error({ err }, 'Error processing order.created event')
        } finally {
          span.end()
        }
      })
    },
  })

  log.info('Kafka consumer started, listening for order.created events')
}
