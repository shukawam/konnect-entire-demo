import { describe, it, expect } from 'vitest'
import { AGENT_LABELS, agentBadgeLabel, waitingText } from '../agent-chat'

describe('agent-chat', () => {
  it('既知のエージェントキーにはラベルを返す', () => {
    expect(agentBadgeLabel('shopper')).toBe(AGENT_LABELS.shopper)
    expect(agentBadgeLabel('recommendation')).toBe(AGENT_LABELS.recommendation)
    expect(agentBadgeLabel('order')).toBe(AGENT_LABELS.order)
  })
  it('未知のキーはそのまま表示する', () => {
    expect(agentBadgeLabel('unknown-agent')).toBe('unknown-agent')
  })
  it('input-required 中の待機テキストを組み立てる', () => {
    expect(waitingText('order')).toBe('Order Agent が入力を待っています…')
  })
})
