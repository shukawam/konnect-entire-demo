import { agent, createVolcanoTelemetry, llmOpenAI, mcp } from '@volcano.dev/agent'
import { QUESTION_MARKER, DONE_MARKER, lastLlmOutput } from '@konnect-demo/a2a-support'
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

// 会話から渡ってくるのは商品名が中心のため、カート追加に必要な productId と価格は
// カタログ検索ツールで解決する（catalog MCP が無いと「金額が分からない」で止まる）。
const catalogMcp = mcp(`${gatewayEndpoint}/mcp/products`)
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
- 商品名しか分からない場合は、まずカタログ検索ツールで該当商品の商品ID（productId）と価格を確認してから
  カート追加・注文操作を行う。transcript に商品IDがあればそれを優先して使う。
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
      // volcano SDK の既定は 4 回。ツール往復が上限に達すると最終応答（llmOutput）が
      // 生成されないまま終わるため、カタログ検索〜注文操作を賄えるだけ引き上げる。
      maxToolIterations: 10,
      mcps: [catalogMcp, cartMcp, orderMcp],
    })
    .run()
  const output = lastLlmOutput(result)
  if (output !== undefined) return output

  // maxToolIterations に到達するとツール呼び出しの途中で打ち切られ、最終応答（llmOutput）が
  // 生成されないまま終わることがある。ここまでの tool 呼び出し結果（カート・注文の状態など）を
  // コンテキストに含んだ単発 LLM 呼び出し（result.ask、ツール呼び出しなし）で、
  // マーカー付きの最終応答を強制的に1回だけ生成させる。result.ask() 自身は SDK 側の英語メタ
  // プロンプトと Kong の ai-prompt-decorator に包まれるためマーカー遵守は保証されない。
  // マーカーが無い応答は parseMarkedReply により無条件に completed 扱いされてしまい
  // （注文確認待ちの応答をマーカー無しで返すと、ユーザーの同意前に注文タスクが completed に
  // なり確認機会が失われる）、空応答（ask 内部は非ストリーミングでもトークン0件を例外にしない）
  // と合わせてここで弾く。
  log.warn({ userId }, 'no llmOutput in agent result; retrying via result.ask()')
  try {
    const fallback = (
      await result.ask(
        llm,
        `これまでの会話とツール呼び出し結果だけを根拠に、追加のツール呼び出しはせず、必ず「${QUESTION_MARKER}」または「${DONE_MARKER}」から始まる応答を1つだけ返してください。`,
      )
    ).trim()
    if (fallback.includes(QUESTION_MARKER) || fallback.includes(DONE_MARKER)) {
      return fallback
    }
    log.warn({ userId, fallback }, 'result.ask() output has no marker; treating as failure')
  } catch (err) {
    log.error({ userId, err }, 'fallback result.ask() also failed')
  }
  return `${DONE_MARKER} 申し訳ありません。処理を完了できませんでした。`
}
