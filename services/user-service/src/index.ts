import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { createLogger } from '@konnect-demo/shared'
import userRoutes from './routes.js'

const log = createLogger('user-service')
const app = new OpenAPIHono()

app.use(
  '*',
  logger((message) => log.info(message)),
)
app.get('/health', (c) => c.json({ status: 'ok' }))
app.route('/api/users', userRoutes)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'User Service API', version: '1.0.0', description: 'ユーザーサービス API' },
  servers: [{ url: 'http://localhost:3005' }],
})

const port = parseInt(process.env.PORT || '3005')
log.info({ port }, 'User Service starting')
serve({ fetch: app.fetch, port })
