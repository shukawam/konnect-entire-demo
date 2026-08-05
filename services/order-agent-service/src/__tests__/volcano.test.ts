import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QUESTION_MARKER, DONE_MARKER } from '@konnect-demo/a2a-support'

const mockRun = vi.fn()
const mockThen = vi.fn(() => ({ run: mockRun }))
const mockAgentFactory = vi.fn((..._args: unknown[]) => ({ then: mockThen }))

vi.mock('@volcano.dev/agent', () => ({
  agent: (...args: unknown[]) => mockAgentFactory(...args),
  createVolcanoTelemetry: vi.fn(() => ({})),
  llmOpenAI: vi.fn(() => ({})),
  mcp: vi.fn(() => ({})),
}))

const { runOrder } = await import('../volcano.js')

beforeEach(() => {
  vi.clearAllMocks()
  mockThen.mockReturnValue({ run: mockRun })
})

describe('runOrder', () => {
  it('llmOutput があればそれをそのまま返す', async () => {
    mockRun.mockResolvedValue(
      Object.assign([{ llmOutput: '[DONE] 注文が確定しました' }], { ask: vi.fn() }),
    )

    const output = await runOrder('user: ダンベルを1個注文して', 'user-1')

    expect(output).toBe('[DONE] 注文が確定しました')
  })

  it('maxToolIterations 到達などで llmOutput が無い場合は result.ask() にマーカー遵守を指示してフォールバックする', async () => {
    const mockAsk = vi.fn().mockResolvedValue('[DONE] ask 経由で確定した注文')
    mockRun.mockResolvedValue(
      Object.assign([{ toolCalls: [{ name: 'create-order' }] }], { ask: mockAsk }),
    )

    const output = await runOrder('user: ダンベルを1個注文して', 'user-1')

    expect(output).toBe('[DONE] ask 経由で確定した注文')
    expect(mockAsk).toHaveBeenCalledTimes(1)
    const [llmArg, promptArg] = mockAsk.mock.calls[0]
    expect(llmArg).toBeDefined()
    expect(promptArg).toContain(QUESTION_MARKER)
    expect(promptArg).toContain(DONE_MARKER)
  })

  it('result.ask() の応答にマーカーが無い場合は信用せず謝罪メッセージを返す', async () => {
    // マーカー無しの確認質問をそのまま返すと parseMarkedReply が completed 扱いしてしまい、
    // ユーザーの同意前に注文タスクが完了したことになる（確認機会の消失）ため、
    // フォールバック側でマーカーの有無を検証する必要がある。
    const mockAsk = vi.fn().mockResolvedValue('マーカー無しの確認質問テキスト')
    mockRun.mockResolvedValue(Object.assign([{}], { ask: mockAsk }))

    const output = await runOrder('user: ダンベルを1個注文して', 'user-1')

    expect(output).toContain(DONE_MARKER)
    expect(output).toContain('申し訳ありません')
  })

  it('result.ask() が空文字列を返した場合も謝罪メッセージを返す', async () => {
    const mockAsk = vi.fn().mockResolvedValue('')
    mockRun.mockResolvedValue(Object.assign([{}], { ask: mockAsk }))

    const output = await runOrder('user: ダンベルを1個注文して', 'user-1')

    expect(output).toContain(DONE_MARKER)
    expect(output).toContain('申し訳ありません')
  })

  it('result.ask() も失敗した場合は謝罪メッセージを DONE マーカー付きで返す', async () => {
    const mockAsk = vi.fn().mockRejectedValue(new Error('llm unavailable'))
    mockRun.mockResolvedValue(Object.assign([{}], { ask: mockAsk }))

    const output = await runOrder('user: ダンベルを1個注文して', 'user-1')

    expect(output).toContain('[DONE]')
    expect(output).toContain('申し訳ありません')
  })
})
