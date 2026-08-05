import { describe, it, expect, vi, afterEach } from 'vitest'

// フォールバック経路は意図的に log.error を通るため、テスト出力を汚さないよう logger を無効化する
vi.mock('@konnect-demo/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { chooseDelegate, buildDelegateTools } from '../a2a/delegate.js'

const cards = [
  {
    key: 'recommendation' as const,
    name: 'Recommendation Agent',
    description: '商品を提案する',
    skills: [{ id: 'product-recommendation', name: '商品の提案', description: '好みを聞いて提案' }],
  },
  {
    key: 'order' as const,
    name: 'Order Agent',
    description: '注文を確定する',
    skills: [{ id: 'cart-and-order', name: 'カート操作と注文確定', description: '数量確認と注文' }],
  },
]

afterEach(() => vi.unstubAllGlobals())

function stubCompletion(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
  )
}

describe('buildDelegateTools', () => {
  it('delegate ツールの enum に Agent Card 由来のキーが入る', () => {
    const tools = buildDelegateTools(cards)
    expect(tools[0].function.name).toBe('delegate')
    expect(tools[0].function.parameters.properties.agent.enum).toEqual(['recommendation', 'order'])
  })
})

describe('chooseDelegate', () => {
  it('tool_calls があれば委譲先を返す', async () => {
    stubCompletion({
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: 'delegate', arguments: '{"agent":"recommendation"}' } },
            ],
          },
        },
      ],
    })
    const decision = await chooseDelegate('マグカップが欲しい', cards, [])
    expect(decision).toEqual({ kind: 'delegate', agent: 'recommendation' })
  })

  it('content 応答なら shopper 自身の返答になる', async () => {
    stubCompletion({ choices: [{ message: { content: 'こんにちは！何をお探しですか？' } }] })
    const decision = await chooseDelegate('こんにちは', cards, [])
    expect(decision).toEqual({ kind: 'reply', text: 'こんにちは！何をお探しですか？' })
  })

  it('LLM 呼び出しが失敗したら reply で聞き返す（フォールバック）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const decision = await chooseDelegate('？？？', cards, [])
    expect(decision.kind).toBe('reply')
  })
})
