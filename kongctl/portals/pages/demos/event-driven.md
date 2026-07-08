---
title: "イベント駆動アーキテクチャ"
description: "Kafka と Kong Event Gateway による非同期処理フローと ACL 制御を体験"
page-layout:
  sidebar-left: sidebar
---

::page-section
---
full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
---

# 📡 シナリオ5: イベント駆動アーキテクチャ

Kafka と Kong Event Gateway を使ったイベント駆動の非同期処理フローを詳しく確認するデモです。注文から配送までのイベントフローと、Event Gateway による ACL 制御を体験します。

::alert
---
type: "info"
show-icon: true
message: "対象: イベント駆動設計に関心のあるアーキテクト ｜ 所要時間: 15〜20分"
---
::

---

## 前提

- 全サービスが起動済み（`docker compose up -d --build`）
- ブラウザで以下にアクセス可能:
  - フロントエンド: http://localhost:3000
  - Kafka UI: http://localhost:8080
  - Grafana: http://localhost:3010

---

## イベント駆動アーキテクチャの全体像

```sh
[Order Service :3003]
     │
     │ produce: order.created
     v
[Kong Event Gateway :19091/19092]  ── Order Service 専用リスナー（ACL: order.created は write のみ、order.status-updated は read のみ）
     │
     v
[Apache Kafka :9092]
     │
     v
[Kong Event Gateway :19093/19094]  ── Shipping Service 専用リスナー（ACL: order.created は read のみ、order.status-updated は write のみ）
     │
     v
[Shipping Service :3004]
     │
     ├── 配送レコード作成
     │
     │ produce: order.status-updated (CONFIRMED)
     v
[Kong Event Gateway :19093/19094]
     │
     v
[Apache Kafka :9092]
     │
     │ 5秒後: order.status-updated (SHIPPED)
     v
[Kong Event Gateway :19091/19092]
     │
     v
[Order Service :3003]
     │
     └── 注文ステータス更新
```

### Kong Event Gateway の役割

- Kafka プロキシとして Order Service と Shipping Service の間に入る
- サービスごとにトピックの ACL（Publish / Subscribe 権限）を制御
- サービスは Kafka に直接接続せず、Event Gateway 経由でアクセス

---

## ステップ 1: Kafka トピックを確認

### 1-1. Kafka UI でトピック一覧を確認

1. http://localhost:8080 にアクセス
2. 左メニューの **Topics** をクリック
3. 以下のトピックが存在することを確認:
   - `order.created` — 注文作成イベント
   - `order.status-updated` — 注文ステータス更新イベント

### 1-2. コマンドラインでトピック確認

```bash
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
```

---

## ステップ 2: イベントフローを発動させる

### 2-1. 注文を作成（ブラウザ）

1. http://localhost:3000 にログイン
2. 商品をカートに追加
3. 注文を確定

### 2-2. 注文を作成（curl）

```bash
# カートに商品を追加（curl は /admin/api/... 経由。apikey 認証、X-User-Id は Kong が curl-admin として自動注入）
curl -X POST http://localhost:8000/admin/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: jungle-store-demo-admin-key" \
  -d '{"productId":"prod-001","quantity":1,"price":1980}'

# 注文確定
curl -X POST http://localhost:8000/admin/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: jungle-store-demo-admin-key"
```

---

## ステップ 3: Kafka メッセージの中身を確認

### 3-1. Kafka UI でメッセージを確認

1. Kafka UI で `order.created` トピックをクリック
2. **Messages** タブを開く
3. 最新のメッセージをクリックして中身を確認

**order.created メッセージの例:**

```json
{
  "orderId": "clx1234...",
  "userId": "curl-admin",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 1,
      "price": 1980
    }
  ],
  "totalPrice": 1980
}
```

4. メッセージの **Headers** を確認:
   - `traceparent` — W3C Trace Context（分散トレースの伝播）
   - `tracestate` — トレース状態

### 3-2. order.status-updated メッセージを確認

1. `order.status-updated` トピックを開く
2. 1つの注文に対して 2 つのメッセージが発行されていることを確認:
   - 1つ目: `status: "CONFIRMED"`（配送レコード作成直後）
   - 2つ目: `status: "SHIPPED"`（5秒後の発送シミュレーション）

**order.status-updated メッセージの例:**

```json
{
  "orderId": "clx1234...",
  "status": "CONFIRMED"
}
```

### 3-3. コマンドラインでメッセージを確認

```bash
# order.created のメッセージ
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order.created \
  --from-beginning

# order.status-updated のメッセージ
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order.status-updated \
  --from-beginning
```

---

## ステップ 4: イベントの時系列を追跡する

### 4-1. Docker ログでイベントフローを追跡

ターミナルを 2 つ開き、Order Service と Shipping Service のログを同時に監視します。

**ターミナル 1: Order Service**

```bash
docker compose logs -f order-service
```

**ターミナル 2: Shipping Service**

```bash
docker compose logs -f shipping-service
```

注文を作成すると、以下の順序でログが出力されます:

| 時刻 | サービス         | ログ内容                                                      |
| ---- | ---------------- | ---------------------------------------------------------------- |
| T+0s | Order Service    | 注文作成、`order.created` を produce                          |
| T+1s | Shipping Service | `order.created` を consume、配送レコード作成                  |
| T+1s | Shipping Service | `order.status-updated (CONFIRMED)` を produce                 |
| T+2s | Order Service    | `order.status-updated (CONFIRMED)` を consume、ステータス更新 |
| T+6s | Shipping Service | `order.status-updated (SHIPPED)` を produce                   |
| T+7s | Order Service    | `order.status-updated (SHIPPED)` を consume、ステータス更新   |

### 解説ポイント

- サービス間は Kafka イベントによる完全な疎結合
- Order Service は Shipping Service の存在を知らない（イベントを発行するだけ）
- 5秒の発送シミュレーション遅延がイベント駆動の非同期性を示している

---

## ステップ 5: Kong Event Gateway の ACL 制御

### 5-1. Event Gateway のアーキテクチャ

Kong Event Gateway はサービスごとに専用のリスナー（ポート）を持ち、各サービスは自分専用のポートで publish/consume の両方を行います:

| ポート        | 接続するサービス | ACL                                                                 |
| ------------- | ---------------- | -------------------------------------------------------------------- |
| 19091 / 19092 | Order Service     | `order.created` は publish のみ可能、`order.status-updated` は consume のみ可能 |
| 19093 / 19094 | Shipping Service  | `order.created` は consume のみ可能、`order.status-updated` は publish のみ可能 |

### 5-2. ACL の効果

- Order Service が `order.status-updated` に直接 publish しようとしても Event Gateway がブロック
- Shipping Service が `order.created` 以外のトピックを consume しようとしてもブロック
- サービスごとに「どのトピックに何ができるか」を Kong の設定で制御

### 解説ポイント

- サービスが Kafka に直接接続する従来の方式と比較して:
  - **セキュリティ:** 各サービスのトピックアクセスを Kong で一元制御
  - **可視性:** Event Gateway のログ・メトリクスでイベントフローを監視
  - **ガバナンス:** トピック ACL の変更がコードデプロイ不要

---

## ステップ 6:（オプション）Grafana でイベントフローのトレースを確認

1. Grafana（http://localhost:3010）→ Explore → Tempo
2. `Service Name: order-service` でトレースを検索
3. 注文作成のトレースを開く
4. Order Service → Kafka produce → Shipping Service → Kafka produce → Order Service の全スパンが 1 つのトレースとして可視化されていることを確認

---

## まとめ

このシナリオで確認した内容:

| 要素                 | 技術               | 効果                                 |
| -------------------- | ------------------ | -------------------------------------- |
| 非同期メッセージング | Apache Kafka       | サービス間の疎結合、スケーラビリティ |
| イベントプロキシ     | Kong Event Gateway | トピック ACL、ガバナンス             |
| トレース伝播         | W3C Trace Context  | Kafka 越えの分散トレース             |
| 自動処理             | KafkaJS Consumer   | 注文→配送の自動フロー                |

Kong Event Gateway により、Kafka ベースのイベント駆動アーキテクチャにも API Gateway と同様のセキュリティ・可視性・ガバナンスを適用できます。

---

[← デモ一覧に戻る](/demos)

::snippet
---
name: "footer-support"
---
::

::
