import { agent, createVolcanoTelemetry, llmOpenAI, mcp } from '@volcano.dev/agent'
import { QUESTION_MARKER, DONE_MARKER } from '@konnect-demo/a2a-support'
import { createLogger } from '@konnect-demo/shared'

const log = createLogger('order-agent-service')

const serviceName = process.env.OTEL_SERVICE_NAME || 'order-agent-service'
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
const gatewayEndpoint = process.env.GATEWAY_ENDPOINT || 'http://localhost:8000'

const telemetry = createVolcanoTelemetry({
  serviceName,
  endpoint: otlpEndpoint,
  traces: true,
  metrics: true,
})

const llm = llmOpenAI({
  apiKey: 'set-api-key-via-kong-gateway',
  model: 'gpt-4o-mini',
  baseURL: `${gatewayEndpoint}/ai/agent/v1`,
})

const cartMcp = mcp(`${gatewayEndpoint}/mcp/carts`)
const orderMcp = mcp(`${gatewayEndpoint}/mcp/orders`)

const INSTRUCTIONS = (userId: string) => `あなたはジャングルストアの注文処理の専門エージェントです。
A2A 経由で Shopper エージェントから会話履歴（transcript）を受け取り、カート追加から注文確定までを行います。

必ず以下のフォーマットで応答してください:
- 数量が未指定、または注文確定前の最終確認が必要な場合:
  応答の先頭に「${QUESTION_MARKER}」を付け、続けて確認内容（商品・数量・合計金額）だけを書く。
- 注文が確定できた場合:
  応答の先頭に「${DONE_MARKER}」を付け、続けて注文番号を含む完了報告を書く。

厳守事項:
- 注文の確定（order 作成ツールの実行）は、transcript 内でユーザーが合計金額に明示的に同意した後にのみ行う。
  同意がまだなら必ず ${QUESTION_MARKER} で最終確認を返す。
- カート・注文の操作には X-User-Id ヘッダーが必要です。userId「${userId}」を使ってください。`

export async function runOrder(transcript: string, userId: string): Promise<string> {
  log.info({ userId }, 'runOrder')
  const result = await agent({
    name: 'order-agent',
    llm,
    telemetry,
    instructions: INSTRUCTIONS(userId),
  })
    .then({
      prompt: `これまでの会話:\n${transcript}\n\n上記を踏まえて応答してください。`,
      mcps: [cartMcp, orderMcp],
    })
    .run()
  return (
    result[result.length - 1]?.llmOutput ??
    `${DONE_MARKER} 申し訳ありません。処理を完了できませんでした。`
  )
}
