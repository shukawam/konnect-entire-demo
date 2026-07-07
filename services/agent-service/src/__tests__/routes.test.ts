import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../agent.js', () => ({
  runAgent: vi.fn(),
}))

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
