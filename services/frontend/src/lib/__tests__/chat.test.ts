import { describe, it, expect } from 'vitest'
import { buildChatMessages, type ChatMessage } from '../chat'

describe('buildChatMessages', () => {
  const history: ChatMessage[] = [
    { role: 'user', content: 'どんな商品がありますか？' },
    { role: 'assistant', content: 'バナナなどがあります' },
  ]
  const userMessage: ChatMessage = { role: 'user', content: 'おすすめは？' }

  it('standalone=true では履歴を付けず質問単体のみ送る（キャッシュヒットを狙う）', () => {
    expect(buildChatMessages(history, userMessage, true)).toEqual([userMessage])
  })

  it('standalone=true は連続クリックで同一ペイロードになる（プロンプト完全一致）', () => {
    const first = buildChatMessages(history, userMessage, true)
    const second = buildChatMessages(
      [...history, userMessage, { role: 'assistant', content: '…' }],
      userMessage,
      true,
    )
    expect(first).toEqual(second)
  })

  it('standalone=false では履歴を含めてマルチターンの文脈を保つ', () => {
    expect(buildChatMessages(history, userMessage, false)).toEqual([...history, userMessage])
  })

  it('履歴が空でも userMessage を含む配列を返す', () => {
    expect(buildChatMessages([], userMessage, false)).toEqual([userMessage])
    expect(buildChatMessages([], userMessage, true)).toEqual([userMessage])
  })
})
