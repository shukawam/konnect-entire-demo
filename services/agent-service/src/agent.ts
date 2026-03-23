import {
  agent,
  createVolcanoTelemetry,
  llmOpenAI,
  mcp,
  MCPConnectionError,
} from '@volcano.dev/agent'
import { HTTPException } from 'hono/http-exception'
import { createLogger } from '@konnect-demo/shared'

const log = createLogger('agent-service')

const serviceName = process.env.OTEL_SERVICE_NAME || 'agent-service'
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

const telemetry = createVolcanoTelemetry({
  serviceName,
  endpoint: otlpEndpoint,
  traces: true,
  metrics: true,
})

const gatewayEndpoint = process.env.GATEWAY_ENDPOINT || 'http://localhost:8000'

const llm = llmOpenAI({
  apiKey: 'set-api-key-via-kong-gateway',
  model: 'gpt-4o-mini',
  baseURL: `${gatewayEndpoint}/ai/v1`,
})

const catalogMcp = mcp(`${gatewayEndpoint}/mcp/products`)
const cartMcp = mcp(`${gatewayEndpoint}/mcp/carts`)
const orderMcp = mcp(`${gatewayEndpoint}/mcp/orders`)

export async function runAgent(prompt: string): Promise<string> {
  try {
    const result = await agent({
      name: 'konnect-demo-agent',
      llm,
      telemetry,
      instructions: `ユーザーからの質問に対して、利用可能なツールを使って正確に回答してください。

      できること:
      - 商品の検索・詳細の確認
      - カートの内容確認・商品の追加・削除
      - 注文履歴の確認

      注意事項:
      - カートや注文の操作には X-User-Id ヘッダーが必要です。ユーザーから提供された userId を使ってください。
      - 扱っていない商品について聞かれた場合は、類似の取り扱い商品を提案してください。`,
    })
      .then({
        prompt,
        mcps: [catalogMcp, cartMcp, orderMcp],
      })
      .run()

    const output = result[result.length - 1]?.llmOutput
    if (output === undefined) {
      return '申し訳ありません。適切な回答を生成できませんでした。もう一度お試しください。'
    }
    return output
  } catch (e) {
    if (e instanceof MCPConnectionError) {
      throw new HTTPException(503, {
        message: 'MCP server is unavailable. Please check Kong Gateway is running.',
      })
    }
    log.error({ err: e }, 'Unexpected error in runAgent')
    throw new HTTPException(500, {
      message: 'Unexpected error occurred.',
    })
  }
}
