import { Kafka } from 'kafkajs'
import { createLogger } from '@konnect-demo/shared'

const log = createLogger('order-service')

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:19092'],
})

export const producer = kafka.producer()
export const consumer = kafka.consumer({ groupId: 'order-service-group' })

export async function connectKafka() {
  await producer.connect()
  log.info('Kafka producer connected')

  await consumer.connect()
  log.info('Kafka consumer connected')

  await consumer.subscribe({ topic: 'order.status-updated', fromBeginning: true })
}

export async function disconnectKafka() {
  await producer.disconnect()
  await consumer.disconnect()
}
