import { consumer } from './kafka.js'
import { prisma } from './db.js'

export async function startConsumer() {
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const value = message.value?.toString()
        if (!value) return

        const event = JSON.parse(value)
        console.log(`Received event on ${topic}:`, event)

        if (topic === 'order.status-updated') {
          await prisma.order.update({
            where: { id: event.orderId },
            data: { status: event.status },
          })
          console.log(`Order ${event.orderId} status updated to ${event.status}`)
        }
      } catch (err) {
        console.error('Error processing message:', err)
      }
    },
  })
}
