# Konnect Entire Demo - はじめに

Kong Konnect の各機能をフル活用したマイクロサービス構成の EC サイトデモです。
ゴリラをテーマにした商品データで、API Gateway・非同期イベント処理・オブザーバビリティを体験できます。

---

## 起動方法

```bash
docker compose up -d --build
```

初回はビルドに数分かかります。全コンテナが起動したら準備完了です。

```bash
docker compose ps
```

### 停止・クリーンアップ

```bash
# 停止（データ保持）
docker compose down

# 停止 + データ削除（完全リセット）
docker compose down -v
```

---

## アクセス先一覧

| サービス             | URL                                                  | 用途                           |
| -------------------- | ---------------------------------------------------- | ------------------------------ |
| フロントエンド       | [http://localhost:3000](http://localhost:3000)       | EC サイト画面                  |
| Kong Gateway (Proxy) | [http://localhost:8000](http://localhost:8000)       | 全 API のエントリーポイント    |
| Konnect              | [https://cloud.konghq.com](https://cloud.konghq.com) | コントロールプレーン（SaaS）   |
| Grafana              | [http://localhost:3010](http://localhost:3010)       | ダッシュボード（ログイン不要） |
| Tempo                | [http://localhost:3200](http://localhost:3200)       | トレース確認                   |

> **Note:** Kong の管理（ルーティング・プラグイン設定等）は Konnect SaaS のコントロールプレーンから行います。
> ローカルの Kong Gateway は Data Plane として動作します。

### 各サービスの OpenAPI ドキュメント

全バックエンドサービスは `/openapi.json` で OAS 3.1.0 を自動生成・配信しています。

| サービス | OpenAPI URL                                                              |
| -------- | ------------------------------------------------------------------------ |
| Catalog  | [http://localhost:3001/openapi.json](http://localhost:3001/openapi.json) |
| Cart     | [http://localhost:3002/openapi.json](http://localhost:3002/openapi.json) |
| Order    | [http://localhost:3003/openapi.json](http://localhost:3003/openapi.json) |
| Shipping | [http://localhost:3004/openapi.json](http://localhost:3004/openapi.json) |
| User     | [http://localhost:3005/openapi.json](http://localhost:3005/openapi.json) |

---

## デモユーザー

起動時に以下のユーザーが自動作成されます。

| 名前                 | メール              | パスワード    | API Key         |
| -------------------- | ------------------- | ------------- | --------------- |
| ゴリラ太郎           | `user@example.com`  | `password123` | `demo-api-key`  |
| シルバーバック管理者 | `admin@example.com` | `password123` | `admin-api-key` |

---

## 商品ラインナップ

起動時に 12 商品が自動投入されます。

| カテゴリ     | 商品例                                               | 価格帯          |
| ------------ | ---------------------------------------------------- | --------------- |
| バナナ       | 極上キングバナナ、バナナチップス、スムージーミックス | ¥1,280〜¥2,480  |
| ファッション | ゴリラマッチョ T シャツ、ジャングルカモパーカー      | ¥4,980〜¥8,900  |
| フィットネス | ゴリラグリップダンベル、クライミングロープ           | ¥7,500〜¥12,800 |
| アウトドア   | ジャングルネスト ハンモック                          | ¥9,800          |
| 書籍         | ゴリラ学入門、バナナレシピ 100 選                    | ¥1,800〜¥2,980  |
| エンタメ     | ドラミング瞑想 CD                                    | ¥2,200          |

---

## 基本操作フロー

### 1. ブラウザで EC サイトを操作

1. http://localhost:3000 を開く
2. **ログイン** → `user@example.com` / `password123`
3. 商品一覧からカテゴリを選んで閲覧
4. 「カートに追加」で商品をカートに入れる
5. カートページで数量調整
6. 「注文する」で注文確定
7. 注文履歴で注文ステータスの変化を確認
   - 注文直後: `PENDING`
   - 数秒後: `CONFIRMED`（Shipping Service が受信）
   - さらに 5 秒後: `SHIPPED`（発送シミュレーション）

### 2. curl で API を直接叩く

```bash
# 商品一覧（認証不要）
curl http://localhost:8000/api/products

# カテゴリ絞り込み
curl "http://localhost:8000/api/products?category=バナナ"

# ユーザー登録
curl -X POST http://localhost:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"新しいゴリラ","email":"new@example.com","password":"password123"}'

# ログイン
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# カートに商品追加（API Key 認証 + X-User-Id 必須）
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" \
  -d '{"productId":"prod-001","quantity":2,"price":1980}'

# カート確認
curl http://localhost:8000/api/carts \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"

# 注文作成（カートの内容で注文 → Kafka → 発送自動作成）
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"

# 注文一覧
curl http://localhost:8000/api/orders \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"

# 発送情報（注文IDで検索）
curl http://localhost:8000/api/shipments/order/<orderId> \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

---

## Kong Konnect 機能デモ

### Key-Auth 認証

```bash
# API Key なし → 401
curl -i http://localhost:8000/api/carts

# API Key あり → 200
curl -i http://localhost:8000/api/carts \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

### Rate Limiting

```bash
# グローバル: 60 req/min、Order Service: 10 req/min
# 連打して 429 Too Many Requests を確認
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8000/api/orders \
    -H "Content-Type: application/json" \
    -H "apikey: demo-api-key" \
    -H "X-User-Id: user-001"
done
```

### Proxy Cache

```bash
# 初回リクエスト → X-Cache-Status: Miss
curl -i http://localhost:8000/api/products

# 2回目 → X-Cache-Status: Hit（30秒間キャッシュ）
curl -i http://localhost:8000/api/products
```

レスポンスヘッダーの `X-Cache-Status` で `Miss` / `Hit` を確認できます。

### Correlation ID

すべてのリクエストに `X-Request-Id` ヘッダーが自動付与されます。

```bash
curl -i http://localhost:8000/api/products 2>&1 | grep -i x-request-id
```

### OpenTelemetry（トレーシング）

Kong Gateway は全リクエストのトレースを OTel Collector 経由で Tempo に送信しています。
Grafana の Tempo データソースからリクエストフロー（Kong → バックエンド → MySQL）を可視化できます。

### Kong Konnect での管理

ルーティング・プラグイン・コンシューマーの設定は [Konnect](https://cloud.konghq.com) から管理します。

- **Gateway Manager** — Data Plane の状態、ルート、サービス、プラグインの確認・変更
- **Analytics** — トラフィック・レイテンシーの分析
- **Dev Portal** — 各サービスの OpenAPI ドキュメントを公開
- **Service Hub** — サービスカタログの管理

---

## 非同期イベント処理 (Kafka)

注文から発送までの流れは Kafka を介した非同期処理で実現しています。

```
[Order Service] --order.created--> [Kafka] ---> [Shipping Service]
                                                      |
                                                      v
                                                 Shipment 作成
                                                 status: PROCESSING
                                                      |
                                          order.status-updated (CONFIRMED)
                                                      |
                                                 5秒後...
                                                      |
                                          order.status-updated (SHIPPED)
                                                      |
[Order Service] <--order.status-updated--- [Kafka] <---'
      |
      v
 Order status 更新
```

### Kafka イベントの確認

```bash
# order.created トピックのメッセージを確認
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order.created \
  --from-beginning

# order.status-updated トピックのメッセージを確認
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order.status-updated \
  --from-beginning
```

---

## オブザーバビリティ

### Grafana ダッシュボード

http://localhost:3010 にアクセス（ログイン不要）。

プリインストール済みのデータソース:
- **Prometheus** — メトリクス（Kong、サービス）
- **Tempo** — 分散トレーシング（リクエストの全体フロー）
- **Loki** — ログ集約

### トレースの確認方法

1. Grafana → Explore → データソースで **Tempo** を選択
2. Search タブで `Service Name` を選んでトレースを検索
3. トレースをクリックすると Kong → バックエンドサービス → MySQL のスパンが見える

### ログの確認方法

1. Grafana → Explore → データソースで **Loki** を選択
2. Label browser で `service_name` を選択
3. トレース ID からのジャンプ: ログ行の `TraceID` リンクをクリックすると Tempo に遷移

### サービスログ（Docker）

```bash
# 特定サービスのログ
docker compose logs -f order-service
docker compose logs -f shipping-service

# Kong Gateway のログ
docker compose logs -f kong
```

---

## アーキテクチャ

```
Browser (:3000)
    │
    v
[Next.js Frontend] ──HTTP──> [Kong Gateway :8000] ──route──> [Catalog  :3001]
                                     │                    ──> [Cart     :3002]
                                     │                    ──> [Order    :3003]
                                     │                    ──> [Shipping :3004]
                                     │                    ──> [User     :3005]
                                     │
                                     └── plugins: cors, rate-limiting, key-auth,
                                         proxy-cache, correlation-id, opentelemetry,
                                         file-log

[Order Service] ──publish──> [Kafka] ──consume──> [Shipping Service]
[Shipping Svc]  ──publish──> [Kafka] ──consume──> [Order Service]

全サービス ──> [MySQL 8.0] (サービスごとに DB 分離)
全サービス ──> [OTel Collector] ──> Tempo (traces) / Prometheus (metrics) / Loki (logs)
```

---

## トラブルシューティング

### サービスが起動しない

```bash
# 全コンテナのステータス確認
docker compose ps

# 失敗しているサービスのログ確認
docker compose logs <service-name>
```

### MySQL 接続エラー

MySQL の起動に時間がかかることがあります。healthcheck が通るまで待機してから他のサービスが起動します。

```bash
# MySQL の状態確認
docker compose logs mysql | tail -20
```

### Kafka 接続エラー

Kafka も起動に時間がかかります。Order/Shipping Service は Kafka 接続失敗時もサーバーは起動しますが、非同期処理は動きません。

```bash
# Kafka の状態確認
docker compose logs kafka | tail -20

# トピック一覧確認
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
```

### キャッシュされた古いビルドをクリア

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```
