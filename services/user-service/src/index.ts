import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import userRoutes from './routes.js'

const app = new OpenAPIHono()

app.use('*', logger())
app.get('/health', (c) => c.json({ status: 'ok' }))
app.route('/api/users', userRoutes)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'User Service API', version: '1.0.0', description: 'ユーザーサービス API' },
  servers: [{ url: 'http://localhost:3005' }],
})

const port = parseInt(process.env.PORT || '3005')
console.log(`User Service starting on port ${port}`)
serve({ fetch: app.fetch, port })
