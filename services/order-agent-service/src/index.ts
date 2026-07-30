import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { createLogger, createErrorHandler, createNotFoundHandler } from '@konnect-demo/shared'
import { a2aHonoApp, MarkerAgentExecutor } from '@konnect-demo/a2a-support'
import { orderCard } from './card.js'
import { runOrder } from './volcano.js'

const log = createLogger('order-agent-service')
const port = parseInt(process.env.PORT || '3008')
const selfUrl = process.env.SELF_URL || `http://localhost:${port}`

const app = new Hono()
app.use(
  '*',
  logger((message) => log.info(message)),
)
app.onError(createErrorHandler(log))
app.notFound(createNotFoundHandler(log))
app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/', a2aHonoApp(orderCard(selfUrl), new MarkerAgentExecutor(runOrder)))

log.info({ port }, 'Order Agent Service starting')
serve({ fetch: app.fetch, port })
