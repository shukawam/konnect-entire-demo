import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { serve, type ServerType } from '@hono/node-server'
import { TaskState, type Task } from '@a2a-js/sdk'
import type { Client } from '@a2a-js/sdk/client'
import { a2aHonoApp } from '../server.js'
import { defineLegacyCard } from '../card.js'
import { MarkerAgentExecutor, QUESTION_MARKER, DONE_MARKER } from '../executor.js'
import { userMessage, replyTextOf } from '../messages.js'
import { createA2AClient } from '../client.js'

const PORT = 41899
// Kong 迂回リグレッション検出用: カードには到達不能な url を載せ、サブパス配下で公開する
const GATEWAY_PORT = 41900
const GATEWAY_PATH = '/a2a/test'
let server: ServerType
let gatewayServer: ServerType
let client: Client

beforeAll(async () => {
  const card = defineLegacyCard({
    name: 'Test Agent',
    description: 'roundtrip test agent',
    url: `http://localhost:${PORT}/`,
    skills: [{ id: 'test', name: 'Test', description: 'test', tags: [], examples: [] }],
  })
  // 1回目は質問、2回目は完了を返すスタブ
  let calls = 0
  const executor = new MarkerAgentExecutor(async (transcript, userId) => {
    calls += 1
    return calls === 1
      ? `${QUESTION_MARKER} 追加情報は？ (userId=${userId})`
      : `${DONE_MARKER} 完了: ${transcript.split('\n').length} 行`
  })
  server = serve({ fetch: a2aHonoApp(card, executor).fetch, port: PORT })
  client = await createA2AClient(`http://localhost:${PORT}`, 'test-key')

  // 実機の専門エージェントはカードに内部 URL（SELF_URL）を載せるため、
  // それをそのまま使うと Kong を迂回する。ここでは到達不能な url を載せて再現する。
  const badCard = defineLegacyCard({
    name: 'Behind Gateway Agent',
    description: 'card advertises an unreachable url',
    url: 'http://unreachable.invalid:9/',
    skills: [{ id: 'test', name: 'Test', description: 'test', tags: [], examples: [] }],
  })
  const gateway = new Hono()
  gateway.route(
    GATEWAY_PATH,
    a2aHonoApp(
      badCard,
      new MarkerAgentExecutor(async () => `${DONE_MARKER} gateway 経由で応答しました`),
    ),
  )
  gatewayServer = serve({ fetch: gateway.fetch, port: GATEWAY_PORT })
})

afterAll(() => {
  server.close()
  gatewayServer.close()
})

describe('A2A roundtrip', () => {
  it('input-required → 同一タスク再開 → completed', async () => {
    const r1 = (await client.sendMessage({
      message: userMessage('こんにちは', { userId: 'u1' }),
      configuration: undefined,
      metadata: undefined,
      tenant: '',
    })) as Task
    expect(r1.status?.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED)
    expect(replyTextOf(r1)).toContain('userId=u1')

    const r2 = (await client.sendMessage({
      message: userMessage('これで全部', { taskId: r1.id, contextId: r1.contextId, userId: 'u1' }),
      configuration: undefined,
      metadata: undefined,
      tenant: '',
    })) as Task
    expect(r2.id).toBe(r1.id)
    expect(r2.status?.state).toBe(TaskState.TASK_STATE_COMPLETED)
  })

  it('カードの url が到達不能でも設定 URL 宛に送信する（Kong 迂回の防止）', async () => {
    const baseUrl = `http://localhost:${GATEWAY_PORT}${GATEWAY_PATH}`
    const gatewayClient = await createA2AClient(baseUrl, 'test-key')
    const res = (await gatewayClient.sendMessage({
      message: userMessage('よろしく', { userId: 'u2' }),
      configuration: undefined,
      metadata: undefined,
      tenant: '',
    })) as Task
    expect(res.status?.state).toBe(TaskState.TASK_STATE_COMPLETED)
    expect(replyTextOf(res)).toContain('gateway 経由で応答しました')
  })

  it('agent card が v0.3 形式で取得できる', async () => {
    const res = await fetch(`http://localhost:${PORT}/.well-known/agent-card.json`)
    const card = await res.json()
    expect(card.url).toBe(`http://localhost:${PORT}/`)
    expect(card.preferredTransport).toBe('JSONRPC')
    expect(card.protocolVersion).toBe('0.3.0')
  })
})
