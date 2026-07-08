# Shipping API

配送情報の取得を行う API です。curl は `/admin/api/shipments` 経路に apikey を付けて呼び出します（X-User-Id は Kong が `curl-admin` として自動注入するため指定不要です）。
Shipment の作成・ステータス更新は Kafka 経由で自動的に行われます。

Base URL: `http://localhost:8000/admin/api/shipments`

## 共通ヘッダー

| ヘッダー | 説明                                            |
| -------- | ----------------------------------------------- |
| `apikey` | API キー（既定: `jungle-store-demo-admin-key`） |

curl 経由のリクエストは Kong の request-transformer によって `X-User-Id: curl-admin` が自動注入されるため、呼び出し側で指定する必要はありません。

## エンドポイント一覧

| メソッド | パス                                   | 概要                   |
| -------- | -------------------------------------- | ---------------------- |
| GET      | `/admin/api/shipments/`                | 配送一覧取得           |
| GET      | `/admin/api/shipments/{id}`            | 配送詳細取得           |
| GET      | `/admin/api/shipments/order/{orderId}` | 注文 ID で配送情報取得 |

## 配送一覧取得

```bash
curl http://localhost:8000/admin/api/shipments/ \
  -H "apikey: jungle-store-demo-admin-key"
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
curl http://localhost:8000/admin/api/shipments/{id} \
  -H "apikey: jungle-store-demo-admin-key"
```

## 注文 ID で配送情報取得

```bash
curl http://localhost:8000/admin/api/shipments/order/{orderId} \
  -H "apikey: jungle-store-demo-admin-key"
```

## ステータス遷移（Kafka 経由で自動）

```
PROCESSING → CONFIRMED → SHIPPED
```

1. `order.created` イベントを受信 → Shipment 作成（`PROCESSING`）→ 即座に `CONFIRMED`
2. 約 5 秒後に `SHIPPED` に更新
3. 各ステータス変更時に `order.status-updated` イベントを発行 → Order Service に反映
