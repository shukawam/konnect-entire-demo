import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { runAgent } from './agent.js'
import { chatCompletionRequestSchema, buildPromptFromMessages, toChatCompletion } from './openai.js'
import { Orchestrator } from './a2a/orchestrator.js'
import { ConversationStore } from './a2a/conversations.js'
import { AgentRegistry, A2AConnectionError } from './a2a/registry.js'

const app = new Hono()

const orchestrator = new Orchestrator(new ConversationStore(), new AgentRegistry())

const chatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1),
})

// A2A エージェントに到達できない場合はデモ運用者向けの 503 に変換する
function toHttpException(e: unknown): unknown {
  if (e instanceof A2AConnectionError) {
    return new HTTPException(503, {
      message: 'エージェントに接続できません。Kong Gateway の起動状態を確認してください。',
    })
  }
  return e
}

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

// Agent モード（A2A オーケストレーション）。Kong openid-connect が JWT を検証し
// X-User-Id を注入する（/api/agent 配下は既存 agent-route の OIDC 保護に乗る）。
app.post('/api/agent/chat', zValidator('json', chatRequestSchema), async (c) => {
  const userId = c.req.header('X-User-Id')
  if (!userId) {
    throw new HTTPException(401, { message: 'X-User-Id header is required' })
  }
  const body = c.req.valid('json')
  try {
    return c.json(await orchestrator.handleChat({ ...body, userId }))
  } catch (e) {
    throw toHttpException(e)
  }
})

app.get('/api/agent/agents', async (c) => {
  try {
    return c.json({ agents: await orchestrator.listAgents() })
  } catch (e) {
    throw toHttpException(e)
  }
})

export default app
