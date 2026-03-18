import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import pino from 'pino'
import { runAgent } from './agent.js'

const log = pino({ name: 'agent-service', level: process.env.LOG_LEVEL || 'info' })

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const chatRequestSchema = z
  .object({
    prompt: z.string().optional(),
    messages: z.array(messageSchema).min(1).optional(),
  })
  .refine((data) => data.prompt !== undefined || data.messages !== undefined, {
    message: 'Either prompt or messages must be provided',
  })

const app = new Hono()

app.use(
  '*',
  logger((message) => log.info(message)),
)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.post('/api/agent/chat', zValidator('json', chatRequestSchema), async (c) => {
  const body = c.req.valid('json')

  let prompt: string
  if (body.messages) {
    prompt = body.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')
  } else {
    prompt = body.prompt!
  }

  const response = await runAgent(prompt)
  return c.json({ response })
})

app.get('/api/agent/suggestions', (c) => {
  return c.json({
    suggestions: [
      'どんな商品がありますか？',
      'おすすめの商品を教えてください',
      '注文履歴を確認したい',
    ],
  })
})

const port = parseInt(process.env.PORT || '3006')
log.info({ port }, 'Agent Service starting')
serve({ fetch: app.fetch, port })
