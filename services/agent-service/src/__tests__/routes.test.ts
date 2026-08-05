import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../agent.js', () => ({
  runAgent: vi.fn(),
}))

// Orchestrator は routes.ts のモジュールロード時に 1 度だけ生成されるため、
// クラスごと差し替えて handleChat / listAgents の呼び出しを観測する。
const { handleChat, listAgents } = vi.hoisted(() => ({
  handleChat: vi.fn(),
  listAgents: vi.fn(),
}))

vi.mock('../a2a/orchestrator.js', () => ({
  Orchestrator: class {
    handleChat = handleChat
    listAgents = listAgents
  },
}))

import { A2AConnectionError } from '../a2a/registry.js'
import app from '../routes.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------- GET /api/agent/suggestions ----------

describe('GET /api/agent/suggestions', () => {
  it('サジェスト一覧を 200 で返す', async () => {
    const res = await app.request('/api/agent/suggestions')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toHaveLength(3)
    expect(body.suggestions).toContain('どんな商品がありますか？')
  })
})

// ---------- POST /api/agent/chat ----------

function chatRequest(body: unknown, headers: Record<string, string> = { 'X-User-Id': 'u1' }) {
  return app.request('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/agent/chat', () => {
  it('オーケストレータの結果を 200 で返す', async () => {
    handleChat.mockResolvedValue({
      conversationId: 'conv-1',
      reply: 'こんにちは！',
      agent: 'shopper',
      state: 'completed',
    })
    const res = await chatRequest({ message: 'こんにちは' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      conversationId: 'conv-1',
      reply: 'こんにちは！',
      agent: 'shopper',
      state: 'completed',
    })
    expect(handleChat).toHaveBeenCalledWith({ message: 'こんにちは', userId: 'u1' })
  })

  it('conversationId を引き継いでオーケストレータに渡す', async () => {
    handleChat.mockResolvedValue({
      conversationId: 'conv-1',
      reply: 'どんな用途ですか？',
      agent: 'recommendation',
      state: 'input-required',
    })
    const res = await chatRequest({ conversationId: 'conv-1', message: 'マグが欲しい' })
    expect(res.status).toBe(200)
    expect(handleChat).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      message: 'マグが欲しい',
      userId: 'u1',
    })
  })

  it('X-User-Id がなければ 401 を返す', async () => {
    const res = await chatRequest({ message: 'こんにちは' }, {})
    expect(res.status).toBe(401)
    expect(handleChat).not.toHaveBeenCalled()
  })

  it('message が空なら 400 を返す', async () => {
    const res = await chatRequest({ message: '' })
    expect(res.status).toBe(400)
    expect(handleChat).not.toHaveBeenCalled()
  })

  it('A2A 接続エラーは 503 に変換される', async () => {
    handleChat.mockRejectedValue(new A2AConnectionError('unavailable'))
    const res = await chatRequest({ message: 'マグが欲しい' })
    expect(res.status).toBe(503)
  })
})

// ---------- GET /api/agent/agents ----------

describe('GET /api/agent/agents', () => {
  it('エージェント一覧を 200 で返す', async () => {
    listAgents.mockResolvedValue([
      {
        key: 'recommendation',
        name: 'Recommendation Agent',
        description: '商品を提案する',
        skills: [{ id: 'product-recommendation', name: '商品の提案', description: '好みを聞く' }],
      },
    ])
    const res = await app.request('/api/agent/agents')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0].key).toBe('recommendation')
  })

  it('A2A 接続エラーは 503 に変換される', async () => {
    listAgents.mockRejectedValue(new A2AConnectionError('unavailable'))
    const res = await app.request('/api/agent/agents')
    expect(res.status).toBe(503)
  })
})
