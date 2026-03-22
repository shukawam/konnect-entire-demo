import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../agent.js', () => ({
  runAgent: vi.fn(),
}))

import app from '../routes.js'
import { runAgent } from '../agent.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------- POST /api/agent/chat ----------

describe('POST /api/agent/chat', () => {
  it('returns 200 with prompt', async () => {
    vi.mocked(runAgent).mockResolvedValue('ゴリラTシャツがおすすめです')

    const res = await app.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'おすすめの商品は？' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ response: 'ゴリラTシャツがおすすめです' })
    expect(runAgent).toHaveBeenCalledWith('おすすめの商品は？')
  })

  it('returns 200 with messages array', async () => {
    vi.mocked(runAgent).mockResolvedValue('カートに追加しました')

    const res = await app.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Tシャツをカートに入れて' },
          { role: 'assistant', content: 'どのTシャツですか？' },
          { role: 'user', content: 'ゴリラTシャツ' },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ response: 'カートに追加しました' })
    expect(runAgent).toHaveBeenCalledWith(
      'User: Tシャツをカートに入れて\nAssistant: どのTシャツですか？\nUser: ゴリラTシャツ',
    )
  })

  it('returns 400 when neither prompt nor messages provided', async () => {
    const res = await app.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 with empty messages array', async () => {
    const res = await app.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })

    expect(res.status).toBe(400)
  })
})

// ---------- GET /api/agent/suggestions ----------

describe('GET /api/agent/suggestions', () => {
  it('returns 200 with suggestions list', async () => {
    const res = await app.request('/api/agent/suggestions')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toHaveLength(3)
    expect(body.suggestions).toContain('どんな商品がありますか？')
  })
})
