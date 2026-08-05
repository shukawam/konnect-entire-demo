// A2A エージェント（agent-service / recommendation-agent-service / order-agent-service）専用の
// HTTP/fetch 自動計装プリロード。NODE_OPTIONS=--import でアプリコード読み込みより前に実行する
// 必要がある（require-in-the-middle ベースの HttpInstrumentation は、対象モジュール（http）が
// 一度でも require された後にインストルメンテーションを有効化しても patch が効かない）。
// これらのサービスは他サービスの @opentelemetry/auto-instrumentations-node と異なり、
// volcano SDK（createVolcanoTelemetry）で LLM/MCP 用のトレース・メトリクスを別途送信するため、
// ここでは HTTP コンテキスト伝搬（受信リクエストの traceparent 抽出・送信 fetch へのヘッダー
// 注入）に絞って有効化する。TracerProvider・エクスポーターの登録は volcano 側が行う
// （このファイルより後に評価されるアプリコードの createVolcanoTelemetry 呼び出し）。
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'

registerInstrumentations({
  instrumentations: [new HttpInstrumentation(), new UndiciInstrumentation()],
})
