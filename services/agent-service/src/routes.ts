import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { runAgent } from './agent.js'
import { chatCompletionRequestSchema, buildPromptFromMessages, toChatCompletion } from './openai.js'

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

// OpenAI 互換エンドポイント。Kong の AI Proxy Advanced からのみ呼ばれる内部 upstream。
// エージェントを「自前ホストの LLM」に見立て、入出力境界で Kong ai-semantic-cache を効かせる。
// 詳細は config/kong/kong.yaml と docs/superpowers/specs/2026-07-07-agent-boundary-kong-semantic-cache-design.md。
app.post('/v1/chat/completions', zValidator('json', chatCompletionRequestSchema), async (c) => {
  const body = c.req.valid('json')
  const prompt = buildPromptFromMessages(body.messages)
  const response = await runAgent(prompt)
  return c.json(toChatCompletion(response, body.model))
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
