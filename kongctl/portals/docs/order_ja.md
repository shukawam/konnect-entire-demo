# 注文 API

全エンドポイントで `x-user-id` ヘッダーが必須です。

## エンドポイント

### GET /api/orders

- **概要:** ユーザーの全注文を取得します（作成日時の降順）。
- **レスポンス:**
  - `200 OK`: 注文の配列（`Order[]`）。
  - `401`: Unauthorized。

### GET /api/orders/{id}

- **概要:** ID で注文を取得します。
- **パラメータ:**
  - `id` (パス, 必須): 注文の ID。
- **レスポンス:**
  - `200 OK`: 注文詳細。
  - `403`: 他ユーザーの注文へのアクセス。
  - `404`: 注文が見つかりません。

### POST /api/orders

- **概要:** カートの内容から注文を作成します。
- **処理フロー:**
  1. Cart Service からカート取得
  2. Catalog Service で在庫チェック
  3. 注文作成
  4. Kafka に `order.created` イベント発行
  5. カートをクリア
- **レスポンス:**
  - `201 Created`: 作成された注文。
  - `400`: カートが空 / 在庫不足。
  - `502`: Cart Service との通信失敗。

## 注文ステータスの遷移

注文作成後、Kafka 非同期処理によりステータスが自動で更新されます:

1. `PENDING` → 注文直後
2. `CONFIRMED` → Shipping Service が受信（数秒後）
3. `SHIPPED` → 発送シミュレーション（さらに5秒後）

## スキーマ

### Order

| 名前       | 型     | 説明                                         |
| ---------- | ------ | -------------------------------------------- |
| id         | string | 注文の ID                                    |
| userId     | string | ユーザーの ID                                |
| status     | string | 注文ステータス (PENDING/CONFIRMED/SHIPPED)   |
| totalPrice | number | 注文の合計金額                               |
| items      | array  | 注文に含まれる商品の配列                     |
| createdAt  | string | 注文作成日時                                 |
| updatedAt  | string | 更新日時                                     |

### OrderItem

| 名前      | 型      | 説明         |
| --------- | ------- | ------------ |
| id        | string  | アイテム ID  |
| orderId   | string  | 注文の ID    |
| productId | string  | 商品の ID    |
| quantity  | integer | 商品の数量   |
| price     | number  | 商品の単価   |
