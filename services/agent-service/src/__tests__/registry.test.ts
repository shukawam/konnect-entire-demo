import { describe, it, expect, vi, beforeEach } from 'vitest'

// レジストリは到達失敗を log.error に流すため、テスト出力を汚さないよう logger を無効化する
vi.mock('@konnect-demo/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('@konnect-demo/a2a-support', () => ({ createA2AClient: vi.fn() }))

import { createA2AClient } from '@konnect-demo/a2a-support'
import { AgentRegistry, A2AConnectionError } from '../a2a/registry.js'

const mocked = vi.mocked(createA2AClient)

function clientFor(name: string) {
  return {
    getAgentCard: vi.fn().mockResolvedValue({
      name,
      description: `${name} の説明`,
      skills: [{ id: 'skill-1', name: 'skill', description: 'desc' }],
    }),
  } as never
}

// ブロック本体にする（式本体だと mock 関数自体が返り、vitest が cleanup として呼んでしまう）
beforeEach(() => {
  mocked.mockReset()
})

describe('AgentRegistry.getSummaries', () => {
  it('一部のエージェントが落ちていても到達できた分を返す', async () => {
    mocked.mockImplementation(async (url: string) =>
      url.includes('recommendation')
        ? clientFor('Recommendation Agent')
        : Promise.reject(new Error('connect ECONNREFUSED')),
    )
    const summaries = await new AgentRegistry().getSummaries()
    expect(summaries.map((s) => s.key)).toEqual(['recommendation'])
    expect(summaries[0].name).toBe('Recommendation Agent')
  })

  it('全エージェントが落ちていたら A2AConnectionError を投げる', async () => {
    mocked.mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(new AgentRegistry().getSummaries()).rejects.toBeInstanceOf(A2AConnectionError)
  })

  it('個別の getClient は到達失敗を A2AConnectionError にする', async () => {
    mocked.mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(new AgentRegistry().getClient('order')).rejects.toBeInstanceOf(A2AConnectionError)
  })
})
