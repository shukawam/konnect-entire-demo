import { describe, it, expect } from 'vitest'
import { ConversationStore } from '../a2a/conversations.js'

describe('ConversationStore', () => {
  it('新規会話を発行し userId を保持する', () => {
    const store = new ConversationStore()
    const conv = store.getOrCreate(undefined, 'u1')
    expect(conv.id).toBeTruthy()
    expect(conv.userId).toBe('u1')
    expect(conv.pending).toBeUndefined()
  })

  it('既知の conversationId は同一の会話を返す', () => {
    const store = new ConversationStore()
    const conv = store.getOrCreate(undefined, 'u1')
    expect(store.getOrCreate(conv.id, 'u1')).toBe(conv)
  })

  it('未知の conversationId は新規会話として扱う（再起動後の復帰）', () => {
    const store = new ConversationStore()
    const conv = store.getOrCreate('gone-after-restart', 'u1')
    expect(conv.id).toBe('gone-after-restart')
    expect(conv.pending).toBeUndefined()
  })

  it('userId が一致しない会話へのアクセスは別 ID の新規会話になり、元の会話は保持される（なりすまし防止）', () => {
    const store = new ConversationStore()
    const conv = store.getOrCreate(undefined, 'u1')
    const other = store.getOrCreate(conv.id, 'u2')
    expect(other.id).not.toBe(conv.id)
    expect(other.userId).toBe('u2')
    // u1 の会話は上書きされない
    expect(store.getOrCreate(conv.id, 'u1')).toBe(conv)
  })

  it('pending の設定と解除ができる', () => {
    const store = new ConversationStore()
    const conv = store.getOrCreate(undefined, 'u1')
    store.setPending(conv, { agentKey: 'order', taskId: 't1', contextId: 'c1' })
    expect(conv.pending).toEqual({ agentKey: 'order', taskId: 't1', contextId: 'c1' })
    store.clearPending(conv)
    expect(conv.pending).toBeUndefined()
  })

  it('transcript に user / agent の発話を蓄積できる', () => {
    const store = new ConversationStore()
    const conv = store.getOrCreate(undefined, 'u1')
    store.append(conv, 'user', 'マグが欲しい')
    store.append(conv, 'recommendation', 'どんな用途ですか？')
    expect(conv.transcript).toEqual([
      { speaker: 'user', text: 'マグが欲しい' },
      { speaker: 'recommendation', text: 'どんな用途ですか？' },
    ])
  })
})
