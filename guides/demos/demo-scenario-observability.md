# シナリオ 3: 分散トレーシング & オブザーバビリティ

Kong Gateway からバックエンドサービス、MySQL、Kafka を横断する分散トレーシングと、Grafana を使ったログ・メトリクスの統合監視を体験するデモです。

**対象:** SRE / Platform Engineer / オブザーバビリティに関心のある方
**所要時間:** 15〜20分

---

## 前提

- 全サービスが起動済み（`docker compose up -d --build`）
- ブラウザで以下にアクセス可能:
  - フロントエンド: http://localhost:3000
  - Grafana: http://localhost:3010（ログイン不要）

---

## オブザーバビリティスタック構成

```sh
全サービス ──(OTLP)──> OTel Collector :4318
                              │
                    ┌─────────┼─────────┐
                    v         v         v
              Tempo :3200  Prometheus  Loki :3100
              (トレース)   (メトリクス) (ログ)
                    │         │         │
                    └─────────┼─────────┘
                              v
                        Grafana :3010
```

- **ゼロコード計装:** `NODE_OPTIONS: --require @opentelemetry/auto-instrumentations-node/register` で全サービスを自動計装
- **Kong Gateway:** `opentelemetry` プラグインで W3C Trace Context を伝播
- **Kafka:** メッセージヘッダーにトレースコンテキストを埋め込み、サービス間でトレースを連結

---

## ステップ 1: トレースデータを生成する

まず、トレースの対象となるリクエストを発生させます。

### 1-1. ブラウザから操作（推奨）

1. http://localhost:3000 にアクセスしてログイン（`user@example.com` / `password123`）
2. 商品一覧を閲覧（Catalog Service へのリクエスト）
3. 商品をカートに追加（Cart Service へのリクエスト）
4. 注文を確定（Order Service → Kafka → Shipping Service）

### 1-2. curl で操作

```bash
# 商品一覧（Kong → Catalog → MySQL）
curl http://localhost:8000/api/products/

# カートに追加（Kong → Cart → MySQL）
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" \
  -d '{"productId":"prod-001","quantity":1,"price":1980}'

# 注文確定（Kong → Order → Kafka → Shipping → Kafka → Order）
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

---

## ステップ 2: Tempo で分散トレースを確認

1. Grafana（http://localhost:3010）を開く
2. 左メニューの **Explore** をクリック
3. データソースで **Tempo** を選択
4. **Search** タブを選択

### 2-1. サービス名でトレースを検索

`Service Name` ドロップダウンから以下を選択して検索:

- `kong` — Kong Gateway のトレース
- `catalog-service` — 商品 API のトレース
- `order-service` — 注文 API のトレース
- `shipping-service` — 配送サービスのトレース

### 2-2. トレース詳細を確認

検索結果からトレースをクリックすると、スパンのウォーターフォール表示が開きます。

**商品一覧リクエストの例:**

```sh
[kong] GET /api/products ─────────────────────── 15ms
  └─[catalog-service] GET /api/products ────── 12ms
       └─[prisma:client:operation] findMany ── 3ms
```

**注文確定リクエストの例（Kafka 越え）:**

```sh
[kong] POST /api/orders ──────────────────────── 45ms
  └─[order-service] POST /api/orders ────────── 40ms
       ├─[prisma:client:operation] create ───── 5ms
       └─[kafka:produce] order.created ──────── 8ms
            └─[shipping-service] consume ────── 30ms
                 ├─[prisma:client:operation] create ── 4ms
                 └─[kafka:produce] order.status-updated ── 5ms
```

### 解説ポイント

- Kong Gateway → バックエンド → MySQL まで 1 つのトレースとして可視化
- 各スパンの処理時間が一目で分かり、ボトルネック特定が容易
- Kafka メッセージヘッダーに W3C Trace Context を埋め込むことで、非同期処理もトレースが繋がる

---

## ステップ 3: Loki でログを確認

1. Grafana の **Explore** で データソースを **Loki** に切り替え
2. Label browser で以下のラベルを使って検索:

### 3-1. サービス別ログの検索

```sh
{service_name="order-service"}
```

```sh
{service_name="shipping-service"}
```

### 3-2. ログからトレースへジャンプ

1. ログ行を展開すると `TraceID` フィールドが表示される
2. `TraceID` のリンクをクリックすると Tempo のトレース詳細に遷移
3. ログで気になるリクエストを見つけたら、そのままトレースの全体像を確認できる

### 解説ポイント

- 構造化 JSON ログが OTel Collector 経由で Loki に集約される
- ログとトレースが TraceID で紐付いているため、シームレスに行き来できる
- 障害調査時にログからトレースに遷移し、リクエストの全体フローを即座に把握可能

---

## ステップ 4: Prometheus でメトリクスを確認

1. Grafana の **Explore** でデータソースを **Prometheus** に切り替え

### 4-1. Kong Gateway のメトリクス

OTel Collector が Kong の Prometheus メトリクスをスクレイプしています。

```promql
# Kong のリクエスト数（サービス別）
kong_http_requests_total

# Kong のレイテンシー分布
kong_request_latency_ms_bucket

# Kong の AI メトリクス（AI Proxy 使用時）
kong_ai_llm_requests_total
```

### 4-2. サービスのメトリクス

```promql
# HTTP リクエストの処理時間
http_server_duration_bucket
```

### 解説ポイント

- Kong Gateway のメトリクスは `prometheus` プラグインで公開、OTel Collector がスクレイプ
- AI Gateway のメトリクス（LLM リクエスト数、トークン使用量など）も収集可能
- Grafana ダッシュボードを作成すればリアルタイム監視が可能

---

## ステップ 5:（オプション）Kafka 越えのトレース伝播を詳しく確認

注文フローの分散トレースが Kafka を越えて繋がる仕組みを詳しく確認します。

### 5-1. 注文を作成してトレースを生成

```bash
# カートに商品を追加
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" \
  -d '{"productId":"prod-001","quantity":1,"price":1980}'

# 注文確定
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

### 5-2. Tempo でトレースを検索

1. Tempo で `Service Name: order-service` のトレースを検索
2. 直近のトレースを開く
3. 以下のスパンが 1 つのトレースに含まれることを確認:
   - `kong` — Gateway のスパン
   - `order-service` — 注文作成 + Kafka produce のスパン
   - `shipping-service` — Kafka consume + 配送作成のスパン

### 5-3. トレースの仕組み

```
Order Service                    Shipping Service
     │                                │
     │  W3C traceparent を             │
     │  Kafka ヘッダーに埋め込み        │
     │  ──── order.created ────>       │
     │                                │  ヘッダーから traceparent を
     │                                │  取り出してスパンを紐付け
     │                                │
     │       <── order.status-updated ─│
     │  ヘッダーから traceparent を     │
     │  取り出してスパンを紐付け        │
```

### 解説ポイント

- 同期 HTTP と非同期 Kafka の両方が 1 つのトレースとして繋がる
- マイクロサービス + イベント駆動の複雑なフローでも全体像を把握できる
- 障害発生時に「どのサービスの、どの処理で、何秒かかったか」を即座に特定可能

---

## まとめ

このシナリオで確認したオブザーバビリティ機能:

| 種類               | ツール     | 確認内容                                       |
| ------------------ | ---------- | ---------------------------------------------- |
| トレース           | Tempo      | Kong → サービス → MySQL → Kafka の分散トレース |
| ログ               | Loki       | 構造化ログ集約、TraceID による紐付け           |
| メトリクス         | Prometheus | Kong リクエスト数、レイテンシ、AI メトリクス   |
| 統合ダッシュボード | Grafana    | 3 種類のデータソースを横断的に可視化           |

ゼロコード計装（`NODE_OPTIONS`）と Kong の `opentelemetry` プラグインにより、アプリケーションコードを変更せずに包括的なオブザーバビリティを実現しています。
