import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { createLogger, createErrorHandler, createNotFoundHandler } from '@konnect-demo/shared'
import routes from './routes.js'

const log = createLogger('agent-service')

const app = new Hono()

app.use(
  '*',
  logger((message) => log.info(message)),
)
app.onError(createErrorHandler(log))
app.notFound(createNotFoundHandler(log))

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/', routes)

const port = parseInt(process.env.PORT || '3006')
log.info({ port }, 'Agent Service starting')
serve({ fetch: app.fetch, port })
