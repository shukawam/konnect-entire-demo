import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { runAgent } from './agent.js'
import { chatCompletionRequestSchema, buildPromptFromMessages, toChatCompletion } from './openai.js'

const app = new Hono()

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
