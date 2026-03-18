# Order API

注文の作成・一覧取得・詳細取得を行う API です。API Key 認証と `X-User-Id` ヘッダーが必要です。
Kong Gateway によるレートリミットが 10 リクエスト/分に設定されています。

Base URL: `http://localhost:8000/api/orders`

## 共通ヘッダー

| ヘッダー | 説明 |
|----------|------|
| `apikey` | API キー（例: `demo-api-key`） |
| `X-User-Id` | ユーザー ID |

## エンドポイント一覧

| メソッド | パス | 概要 |
|----------|------|------|
| GET | `/api/orders/` | 注文一覧取得 |
| GET | `/api/orders/{id}` | 注文詳細取得 |
| POST | `/api/orders/` | 注文作成 |

## 注文一覧取得

```bash
curl http://localhost:8000/api/orders/ \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

### レスポンス例

```json
[
  {
    "id": "clx...",
    "userId": "user-1",
    "status": "SHIPPED",
    "totalPrice": 7000,
    "items": [
      {
        "id": "clx...",
        "productId": "prod-1",
        "quantity": 2,
        "price": 3500
      }
    ],
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
]
```

## 注文詳細取得

```bash
curl http://localhost:8000/api/orders/{id} \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

他ユーザーの注文にアクセスすると `403` が返ります。

## 注文作成

カートの内容から注文を作成します。リクエストボディは不要です。

```bash
curl -X POST http://localhost:8000/api/orders/ \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

### 処理フロー

1. Cart Service からカートを取得
2. Catalog Service で在庫を確認
3. 注文を作成（ステータス: `PENDING`）
4. Kafka に `order.created` イベントを発行
5. カートを自動クリア

### ステータス遷移

注文作成後、Kafka を介して非同期にステータスが更新されます。

```
PENDING → CONFIRMED → SHIPPED
```

- `CONFIRMED`: Shipping Service が Shipment を作成した時点
- `SHIPPED`: Shipping Service が発送処理を完了した時点（約 5 秒後）

### エラーケース

| ステータス | 説明 |
|------------|------|
| 400 | カートが空 |
| 401 | `X-User-Id` ヘッダーなし |
| 502 | Cart Service / Catalog Service への通信失敗 |
