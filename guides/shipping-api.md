# Shipping API

配送情報の取得を行う API です。API Key 認証と `X-User-Id` ヘッダーが必要です。
Shipment の作成・ステータス更新は Kafka 経由で自動的に行われます。

Base URL: `http://localhost:8000/api/shipments`

## 共通ヘッダー

| ヘッダー    | 説明                           |
| ----------- | ------------------------------ |
| `apikey`    | API キー（例: `demo-api-key`） |
| `X-User-Id` | ユーザー ID                    |

## エンドポイント一覧

| メソッド | パス                             | 概要                   |
| -------- | -------------------------------- | ---------------------- |
| GET      | `/api/shipments/`                | 配送一覧取得           |
| GET      | `/api/shipments/{id}`            | 配送詳細取得           |
| GET      | `/api/shipments/order/{orderId}` | 注文 ID で配送情報取得 |

## 配送一覧取得

```bash
curl http://localhost:8000/api/shipments/ \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

### レスポンス例

```json
[
  {
    "id": "clx...",
    "orderId": "order-1",
    "userId": "user-1",
    "status": "SHIPPED",
    "trackingNumber": "TRK-abc123",
    "shippedAt": "2025-01-01T00:00:05.000Z",
    "deliveredAt": null,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:05.000Z"
  }
]
```

## 配送詳細取得

```bash
curl http://localhost:8000/api/shipments/{id} \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

## 注文 ID で配送情報取得

```bash
curl http://localhost:8000/api/shipments/order/{orderId} \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

## ステータス遷移（Kafka 経由で自動）

```
PROCESSING → CONFIRMED → SHIPPED
```

1. `order.created` イベントを受信 → Shipment 作成（`PROCESSING`）→ 即座に `CONFIRMED`
2. 約 5 秒後に `SHIPPED` に更新
3. 各ステータス変更時に `order.status-updated` イベントを発行 → Order Service に反映
