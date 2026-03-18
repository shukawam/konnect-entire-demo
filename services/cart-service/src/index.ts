import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import cartRoutes from './routes.js'

const app = new OpenAPIHono()

app.use('*', logger())
app.get('/health', (c) => c.json({ status: 'ok' }))
app.route('/api/carts', cartRoutes)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Cart Service API', version: '1.0.0', description: 'カートサービス API' },
  servers: [{ url: 'http://localhost:3002' }],
})

const port = Number(process.env.PORT) || 3002
serve({ fetch: app.fetch, port }, () => {
  console.log(`Cart service running on port ${port}`)
})
