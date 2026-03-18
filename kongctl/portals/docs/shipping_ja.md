# 配送 API

全エンドポイントで `x-user-id` ヘッダーが必須です。

## エンドポイント

### GET /api/shipments

- **概要:** ユーザーの全発送情報を取得します（作成日時の降順）。
- **レスポンス:**
  - `200 OK`: 発送情報の配列（`Shipment[]`）。
  - `401`: Unauthorized。

### GET /api/shipments/{id}

- **概要:** ID で発送情報を取得します。
- **パラメータ:**
  - `id` (パス, 必須): 発送の ID。
- **レスポンス:**
  - `200 OK`: 発送詳細。
  - `403`: 他ユーザーの発送情報へのアクセス。
  - `404`: 発送情報が見つかりません。

### GET /api/shipments/order/{orderId}

- **概要:** 注文 ID から発送情報を取得します。
- **パラメータ:**
  - `orderId` (パス, 必須): 注文の ID。
- **レスポンス:**
  - `200 OK`: 発送詳細。
  - `403`: 他ユーザーの発送情報へのアクセス。
  - `404`: 発送情報が見つかりません。

## 配送ステータスの遷移

配送は Kafka 経由で自動的に作成・更新されます:

1. `PROCESSING` → 注文受信時に Shipment が自動作成
2. `SHIPPED` → 5秒後に発送シミュレーション

## スキーマ

### Shipment

| 名前           | 型             | 説明                                |
| -------------- | -------------- | ----------------------------------- |
| id             | string         | 発送の ID                           |
| orderId        | string         | 関連する注文の ID                   |
| userId         | string         | ユーザーの ID                       |
| status         | string         | 発送ステータス (PROCESSING/SHIPPED) |
| trackingNumber | string \| null | 追跡番号                            |
| shippedAt      | string \| null | 発送日時                            |
| deliveredAt    | string \| null | 配達日時                            |
| createdAt      | string         | 作成日時                            |
| updatedAt      | string         | 更新日時                            |
