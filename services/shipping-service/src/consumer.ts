import { randomBytes } from 'node:crypto'
import { consumer, producer } from './kafka.js'
import { prisma } from './db.js'

function generateTrackingNumber(): string {
  return 'TRK-' + randomBytes(4).toString('hex').toUpperCase()
}

export async function startConsumer() {
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const value = message.value?.toString()
        if (!value) return

        const event = JSON.parse(value)
        console.log('Received order.created event:', event)

        const { orderId, userId } = event
        if (!orderId || !userId) {
          console.error('Invalid order.created event: missing orderId or userId')
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

        console.log(`Shipment created: ${shipment.id} for order ${orderId}`)

        // Publish order.status-updated -> CONFIRMED
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
            },
          ],
        })

        console.log(`Published order.status-updated (CONFIRMED) for order ${orderId}`)

        // Simulate shipping after 5 seconds
        setTimeout(async () => {
          try {
            const shippedAt = new Date()

            await prisma.shipment.update({
              where: { id: shipment.id },
              data: {
                status: 'SHIPPED',
                shippedAt,
              },
            })

            console.log(`Shipment ${shipment.id} updated to SHIPPED`)

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
                },
              ],
            })

            console.log(`Published order.status-updated (SHIPPED) for order ${orderId}`)
          } catch (err) {
            console.error(`Failed to update shipment to SHIPPED for order ${orderId}:`, err)
          }
        }, 5000)
      } catch (err) {
        console.error('Error processing order.created event:', err)
      }
    },
  })

  console.log('Kafka consumer started, listening for order.created events')
}
