import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPromptFromMessages, toChatCompletion } from '../openai.js'

vi.mock('../agent.js', () => ({ runAgent: vi.fn() }))

import app from '../routes.js'
import { runAgent } from '../agent.js'

beforeEach(() => vi.clearAllMocks())

describe('buildPromptFromMessages', () => {
  it('user 1 件を User: 付きで連結する', () => {
    expect(buildPromptFromMessages([{ role: 'user', content: 'どんな商品がありますか？' }])).toBe(
      'User: どんな商品がありますか？',
    )
  })

  it('user/assistant を改行で連結しラベルを付ける', () => {
    const prompt = buildPromptFromMessages([
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user', content: 'C' },
    ])
    expect(prompt).toBe('User: A\nAssistant: B\nUser: C')
  })

  it('system は System: ラベルを付ける', () => {
    expect(buildPromptFromMessages([{ role: 'system', content: 'X' }])).toBe('System: X')
  })
})

describe('toChatCompletion', () => {
  it('文字列を OpenAI chat completion 形式にラップする', () => {
    const c = toChatCompletion('こんにちは', 'gpt-4o-mini')
    expect(c.object).toBe('chat.completion')
    expect(c.model).toBe('gpt-4o-mini')
    expect(c.choices[0].message).toEqual({ role: 'assistant', content: 'こんにちは' })
    expect(c.choices[0].finish_reason).toBe('stop')
    expect(c.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
  })

  it('model 省略時は gpt-4o-mini を使う', () => {
    expect(toChatCompletion('x').model).toBe('gpt-4o-mini')
  })
})

describe('POST /v1/chat/completions', () => {
  it('OpenAI 形式リクエストで OpenAI 形式レスポンスを返す', async () => {
    vi.mocked(runAgent).mockResolvedValue('バナナがおすすめです')

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'おすすめは？' }],
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.object).toBe('chat.completion')
    expect(body.choices[0].message.content).toBe('バナナがおすすめです')
    expect(runAgent).toHaveBeenCalledWith('User: おすすめは？')
  })

  it('messages が空だと 400 を返す', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    expect(res.status).toBe(400)
    expect(runAgent).not.toHaveBeenCalled()
  })
})
