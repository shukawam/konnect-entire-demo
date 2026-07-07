# Agent API

AI チャットエージェントの API です。Volcano Agent SDK を使用し、Kong AI MCP Proxy 経由で既存の Catalog / Cart / Order API をツールとして活用します。

Base URL: `http://localhost:8000/api/agent`

## アーキテクチャ

```
ユーザー → Agent Service → Kong ai-proxy-advanced → OpenAI (LLM)
                         → Kong ai-mcp-proxy       → Catalog / Cart / Order API (MCP ツール)
```

- LLM リクエストは Kong の `ai-proxy-advanced` プラグイン経由で OpenAI に送信されます（API キーは Kong 側で注入）
- MCP ツールは Kong の `ai-mcp-proxy` プラグインで既存 REST API を MCP 化したものです

## エンドポイント一覧

| メソッド | パス                                 | 概要                                                |
| -------- | ------------------------------------ | --------------------------------------------------- |
| POST     | `/ai/agent-chat/v1/chat/completions` | AI チャット（OpenAI 互換・Kong 境界キャッシュ経由） |
| GET      | `/api/agent/suggestions`             | サジェスト取得                                      |

## AI チャット

チャットは Kong の OpenAI 互換境界ルート `POST http://localhost:8000/ai/agent-chat/v1/chat/completions` 経由で行います。このルートは Kong の `ai-proxy-advanced`（upstream: agent-service）と `ai-semantic-cache` で保護されており、意味的に類似した質問はキャッシュされます（詳細は `guides/demos/demo-scenario-ai-gateway.md` 参照）。

### リクエスト送信

```bash
curl -X POST http://localhost:8000/ai/agent-chat/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "おすすめの商品を教えてください"}
    ]
  }'
```

### リクエストボディ

OpenAI の chat-completions 形式に従います。

| フィールド | 型     | 必須 | 説明                                  |
| ---------- | ------ | ---- | ------------------------------------- |
| `model`    | string | ○    | 使用するモデル名（例: `gpt-4o-mini`） |
| `messages` | array  | ○    | 会話履歴（`role` + `content`）        |

### レスポンス例

OpenAI の chat completion 形式で返却されます。回答本文は `choices[0].message.content` に入ります。

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "ゴリラストアには以下の商品がございます..."
      }
    }
  ]
}
```

## サジェスト取得

ユーザーに表示する質問候補を返します。

```bash
curl http://localhost:8000/api/agent/suggestions
```

### レスポンス例

```json
{
  "suggestions": [
    "どんな商品がありますか？",
    "おすすめの商品を教えてください",
    "注文履歴を確認したい"
  ]
}
```

## 利用可能な MCP ツール

エージェントは以下のツールを自動的に使い分けます。

| ツール              | 元 API                   | 説明                                         |
| ------------------- | ------------------------ | -------------------------------------------- |
| List products       | GET `/api/products`      | 商品一覧取得（カテゴリ・キーワード検索対応） |
| Get product details | GET `/api/products/{id}` | 商品詳細取得                                 |
| Get cart            | GET `/api/carts`         | カート内容取得                               |
| Add item to cart    | POST `/api/carts/items`  | カートに商品追加                             |
| List orders         | GET `/api/orders`        | 注文履歴取得                                 |
| Create order        | POST `/api/orders`       | 注文作成                                     |

## 環境変数

| 変数名                        | デフォルト            | 説明                             |
| ----------------------------- | --------------------- | -------------------------------- |
| `PORT`                        | 3006                  | サービスポート                   |
| `GATEWAY_ENDPOINT`            | http://localhost:8000 | Kong Gateway の内部 URL          |
| `OTEL_SERVICE_NAME`           | agent-service         | OTel サービス名                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | http://localhost:4318 | OTel Collector エンドポイント    |
| `DECK_OPENAI_API_KEY`         | -                     | OpenAI API キー（Kong 側で設定） |
