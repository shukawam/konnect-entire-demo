import { describe, it, expect } from 'vitest'
import { Role } from '@a2a-js/sdk'
import { userMessage, agentMessage, textOf } from '../messages.js'

describe('messages', () => {
  it('userMessage は必須配列フィールドを備えた v1 Message を生成する', () => {
    const msg = userMessage('hello', { userId: 'user-1' })
    expect(msg.role).toBe(Role.ROLE_USER)
    expect(msg.parts).toEqual([{ content: { $case: 'text', value: 'hello' } }])
    expect(msg.metadata).toEqual({ userId: 'user-1' })
    // SDK v1 の compat 変換は extensions / referenceTaskIds が undefined だと落ちる
    expect(msg.extensions).toEqual([])
    expect(msg.referenceTaskIds).toEqual([])
    expect(msg.taskId).toBe('')
    expect(msg.contextId).toBe('')
  })

  it('userMessage は taskId / contextId を引き継ぐ', () => {
    const msg = userMessage('more', { taskId: 't1', contextId: 'c1', userId: 'user-1' })
    expect(msg.taskId).toBe('t1')
    expect(msg.contextId).toBe('c1')
  })

  it('agentMessage は ROLE_AGENT で text part を持つ', () => {
    const msg = agentMessage('t1', 'c1', 'どんな用途ですか？')
    expect(msg.role).toBe(Role.ROLE_AGENT)
    expect(textOf(msg)).toBe('どんな用途ですか？')
  })

  it('textOf は text part を連結し、undefined には空文字を返す', () => {
    expect(textOf(undefined)).toBe('')
  })
})
