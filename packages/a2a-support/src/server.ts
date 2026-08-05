import { Hono } from 'hono'
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  ServerCallContext,
  type AgentExecutor,
} from '@a2a-js/sdk/server'
import { LegacyJsonRpcTransportHandler } from '@a2a-js/sdk/compat/v0_3/server'
import { toCoreCard, type LegacyAgentCard } from './card.js'

// A2A v0.3 JSON-RPC を話す Hono サブアプリ。Kong ai-a2a-proxy の検出対象に合わせ、
// カードは v0.3 形式・RPC は Legacy ハンドラで公開する。streaming は capabilities で
// 無効化済み（v1 スコープ外）。
export function a2aHonoApp(card: LegacyAgentCard, executor: AgentExecutor): Hono {
  const requestHandler = new DefaultRequestHandler(
    toCoreCard(card),
    new InMemoryTaskStore(),
    executor,
  )
  const rpc = new LegacyJsonRpcTransportHandler(requestHandler)

  const app = new Hono()
  app.get('/.well-known/agent-card.json', (c) => c.json(card))
  app.post('/', async (c) => {
    const body = await c.req.text()
    const result = await rpc.handle(body, new ServerCallContext())
    if (Symbol.asyncIterator in Object(result)) {
      return c.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32004, message: 'streaming is not supported' },
      })
    }
    return c.json(result as object)
  })
  return app
}
