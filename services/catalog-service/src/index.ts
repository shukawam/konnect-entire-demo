import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { createLogger, createErrorHandler, createNotFoundHandler } from '@konnect-demo/shared'
import productRoutes from './routes.js'

const log = createLogger('catalog-service')
const app = new OpenAPIHono()

app.use(
  '*',
  logger((message) => log.info(message)),
)
app.onError(createErrorHandler(log))
app.notFound(createNotFoundHandler(log))

app.get('/health', (c) => c.json({ status: 'ok', service: 'catalog-service' }))

app.route('/api/products', productRoutes)

// OpenAPI doc endpoint
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Catalog Service API',
    version: '1.0.0',
    description: '商品カタログサービス API',
  },
  servers: [{ url: 'http://localhost:3001' }],
})

const port = Number(process.env.PORT) || 3001
log.info({ port }, 'Catalog service starting')
serve({ fetch: app.fetch, port })
