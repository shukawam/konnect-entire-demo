import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { createLogger, createErrorHandler, createNotFoundHandler } from '@konnect-demo/shared'
import routes from './routes.js'
import { connectKafka, disconnectKafka } from './kafka.js'
import { startConsumer } from './consumer.js'

const log = createLogger('order-service')
const app = new OpenAPIHono()

app.use(
  '*',
  logger((message) => log.info(message)),
)
app.onError(createErrorHandler(log))
app.notFound(createNotFoundHandler(log))

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
    log.info('Kafka consumer started')
  } catch (err) {
    log.error({ err }, 'Failed to connect Kafka, starting without it')
  }

  serve({ fetch: app.fetch, port }, () => {
    log.info({ port }, 'Order service running')
  })
}

process.on('SIGTERM', async () => {
  log.info('Shutting down...')
  await disconnectKafka()
  process.exit(0)
})

main()
