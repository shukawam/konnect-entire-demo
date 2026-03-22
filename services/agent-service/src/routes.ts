import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { runAgent } from './agent.js'

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

app.post('/api/agent/chat', zValidator('json', chatRequestSchema), async (c) => {
  const body = c.req.valid('json')

  let prompt: string
  if (body.messages) {
    prompt = body.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')
  } else {
    prompt = body.prompt ?? ''
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

export default app
