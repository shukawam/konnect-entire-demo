import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import productRoutes from './routes.js'

const app = new OpenAPIHono()

app.use('*', logger())

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
console.log(`Catalog service starting on port ${port}`)
serve({ fetch: app.fetch, port })
