import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { createLogger, createErrorHandler, createNotFoundHandler } from '@konnect-demo/shared'
import routes from './routes.js'
import { connectKafka, disconnectKafka } from './kafka.js'
import { startConsumer } from './consumer.js'

const log = createLogger('shipping-service')
const app = new OpenAPIHono()

app.use(
  '*',
  logger((message) => log.info(message)),
)
app.onError(createErrorHandler(log))
app.notFound(createNotFoundHandler(log))

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
    log.info('Kafka initialized and consumer started')
  } catch (err) {
    log.error({ err }, 'Failed to initialize Kafka')
    log.info('Starting server without Kafka...')
  }
  serve({ fetch: app.fetch, port }, () => {
    log.info({ port }, 'Shipping service running')
  })
}

process.on('SIGTERM', async () => {
  log.info('Shutting down...')
  await disconnectKafka()
  process.exit(0)
})

main()
