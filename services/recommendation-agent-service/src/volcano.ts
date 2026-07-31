import { agent, createVolcanoTelemetry, llmOpenAI, mcp } from '@volcano.dev/agent'
import { QUESTION_MARKER, DONE_MARKER } from '@konnect-demo/a2a-support'
import { createLogger } from '@konnect-demo/shared'

const log = createLogger('recommendation-agent-service')

const serviceName = process.env.OTEL_SERVICE_NAME || 'recommendation-agent-service'
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

const catalogMcp = mcp(`${gatewayEndpoint}/mcp/products`)

const INSTRUCTIONS = `あなたはジャングルストアの商品提案の専門エージェントです。
A2A 経由で Shopper エージェントから会話履歴（transcript）を受け取り、商品を提案します。

必ず以下のフォーマットで応答してください:
- ユーザーの好み・用途がまだ曖昧で追加の質問が必要な場合:
  応答の先頭に「${QUESTION_MARKER}」を付け、続けて質問文だけを書く。
- 提案がまとまった場合:
  応答の先頭に「${DONE_MARKER}」を付け、続けて商品名・価格・提案理由を含む提案文を書く。

注意事項:
- 商品はツールでカタログを検索し、実在する商品だけを提案する。
- 質問は一度に 1 つ。2 回程度のやりとりで提案に進む。
- 扱っていない商品を求められたら、類似の取り扱い商品を提案する。`

export async function runRecommendation(transcript: string, userId: string): Promise<string> {
  log.info({ userId }, 'runRecommendation')
  const result = await agent({
    name: 'recommendation-agent',
    llm,
    telemetry,
    instructions: INSTRUCTIONS,
  })
    .then({
      prompt: `これまでの会話:\n${transcript}\n\n上記を踏まえて応答してください。`,
      mcps: [catalogMcp],
    })
    .run()
  return (
    result[result.length - 1]?.llmOutput ??
    `${DONE_MARKER} 申し訳ありません。提案を生成できませんでした。`
  )
}
