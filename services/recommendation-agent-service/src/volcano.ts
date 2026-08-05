import { agent, createVolcanoTelemetry, llmOpenAI, mcp } from '@volcano.dev/agent'
import { QUESTION_MARKER, DONE_MARKER, lastLlmOutput } from '@konnect-demo/a2a-support'
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
  応答の先頭に「${DONE_MARKER}」を付け、続けて各商品の 商品名・商品ID・価格・提案理由 を書く
  （例:「Gorilla Mug（商品ID: xxx / ¥2,000）— 保温性が高く…」）。Markdown リンクは付けない。
  商品IDは後続の注文処理で使われるため必ず含めること。

注意事項:
- 商品はツールでカタログを検索し、実在する商品だけを提案する。
- 質問は会話全体で最大 1 回まで。transcript に既に自分（agent）の質問が含まれている場合は、
  情報が完全でなくても必ず ${DONE_MARKER} で提案する。同じ趣旨の質問を繰り返さない。
- ユーザーが購入・注文の意思を示した場合（「注文して」「これにする」等）は、質問せずに
  ${DONE_MARKER} で対象商品の 商品名・商品ID・価格 を明記して提案を確定する。
- 扱っていない商品を求められたら、質問せずに類似の取り扱い商品を ${DONE_MARKER} で提案する。`

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
      // volcano SDK の既定は 4 回。ツール往復が上限に達すると最終応答（llmOutput）が
      // 生成されないまま終わるため、カタログ検索〜注文操作を賄えるだけ引き上げる。
      maxToolIterations: 10,
      mcps: [catalogMcp],
    })
    .run()
  const output = lastLlmOutput(result)
  if (output !== undefined) return output

  // maxToolIterations に到達するとツール呼び出しの途中で打ち切られ、最終応答（llmOutput）が
  // 生成されないまま終わることがある。ここまでの tool 呼び出し結果（カタログ検索結果など）を
  // コンテキストに含んだ単発 LLM 呼び出し（result.ask、ツール呼び出しなし）で、
  // マーカー付きの最終応答を強制的に1回だけ生成させる。result.ask() 自身は SDK 側の英語メタ
  // プロンプトと Kong の ai-prompt-decorator に包まれるためマーカー遵守は保証されない。
  // マーカーが無い応答は parseMarkedReply により無条件に completed 扱いされてしまい
  // （例: 注文確認待ちの応答をマーカー無しで返すと、確認前に注文タスクが completed になり
  // ユーザーの同意なしに終了したように見える）、空応答（ask 内部は非ストリーミングでも
  // トークン0件を例外にしない）と合わせてここで弾く。
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
  return `${DONE_MARKER} 申し訳ありません。提案を生成できませんでした。`
}
