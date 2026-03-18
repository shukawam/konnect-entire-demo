import { Kafka } from 'kafkajs'
import { createLogger } from '@konnect-demo/shared'

const log = createLogger('shipping-service')

const kafka = new Kafka({
  clientId: 'shipping-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:19093'],
})

export const producer = kafka.producer()
export const consumer = kafka.consumer({ groupId: 'shipping-service-group' })

export async function connectKafka() {
  await producer.connect()
  log.info('Kafka producer connected')

  await consumer.connect()
  log.info('Kafka consumer connected')

  await consumer.subscribe({ topic: 'order.created', fromBeginning: true })
}

export async function disconnectKafka() {
  await producer.disconnect()
  await consumer.disconnect()
}
