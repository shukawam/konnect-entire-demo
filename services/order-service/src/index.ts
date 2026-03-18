import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import routes from './routes.js'
import { connectKafka, disconnectKafka } from './kafka.js'
import { startConsumer } from './consumer.js'

const app = new OpenAPIHono()

app.use('*', logger())
app.get('/health', (c) => c.json({ status: 'ok' }))
app.route('/api/orders', routes)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Order Service API', version: '1.0.0', description: '注文サービス API' },
  servers: [{ url: 'http://localhost:3003' }],
})

const port = Number(process.env.PORT) || 3003

async function main() {
  try {
    await connectKafka()
    await startConsumer()
    console.log('Kafka consumer started')
  } catch (err) {
    console.error('Failed to connect Kafka, starting without it:', err)
  }

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Order service running on port ${port}`)
  })
}

process.on('SIGTERM', async () => {
  console.log('Shutting down...')
  await disconnectKafka()
  process.exit(0)
})

main()
