import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import routes from './routes.js'
import { connectKafka, disconnectKafka } from './kafka.js'
import { startConsumer } from './consumer.js'

const app = new OpenAPIHono()

app.use('*', logger())
app.get('/health', (c) => c.json({ status: 'ok', service: 'shipping-service' }))
app.route('/api/shipments', routes)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Shipping Service API', version: '1.0.0', description: '配送サービス API' },
  servers: [{ url: 'http://localhost:3004' }],
})

const port = Number(process.env.PORT) || 3004

async function main() {
  try {
    await connectKafka()
    await startConsumer()
    console.log('Kafka initialized and consumer started')
  } catch (err) {
    console.error('Failed to initialize Kafka:', err)
    console.log('Starting server without Kafka...')
  }
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Shipping service running on port ${port}`)
  })
}

process.on('SIGTERM', async () => {
  console.log('Shutting down...')
  await disconnectKafka()
  process.exit(0)
})

main()
