import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import pino from 'pino'
import routes from './routes.js'

const log = pino({ name: 'agent-service', level: process.env.LOG_LEVEL || 'info' })

const app = new Hono()

app.use(
  '*',
  logger((message) => log.info(message)),
)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/', routes)

const port = parseInt(process.env.PORT || '3006')
log.info({ port }, 'Agent Service starting')
serve({ fetch: app.fetch, port })
