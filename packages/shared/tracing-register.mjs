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
  instrumentations: [
    new HttpInstrumentation(),
    new UndiciInstrumentation({
      // MCP Streamable HTTP クライアント（volcano SDK の mcp()）が SSE 受信用に GET /mcp/* へ
      // 定期再接続する（ai-mcp-proxy がストリームを保持せず即クローズするため、SDK が「正常切断」と
      // みなして再試行し続ける）。この GET は pool 済みコネクションの元になった呼び出し時点の
      // AsyncLocalStorage コンテキストを setTimeout 経由でそのまま引き継ぐため、計装したまま放置すると
      // 何十秒も経った後続の別リクエストのトレースにまで無関係な span として混入し続ける。
      // ここで span 化・traceparent 注入自体を止めて発生源で断つ（Kong 側の受信もコンテキスト無しの
      // 独立トレースに戻り、Collector の tail_sampling で無害に除去できる）。
      ignoreRequestHook: (request) => request.method === 'GET' && request.path.startsWith('/mcp/'),
    }),
  ],
})
