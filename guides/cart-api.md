# Cart API

ユーザーごとのカート操作を行う API です。全エンドポイントで API Key 認証と `X-User-Id` ヘッダーが必要です。

Base URL: `http://localhost:8000/api/carts`

## 共通ヘッダー

| ヘッダー    | 説明                           |
| ----------- | ------------------------------ |
| `apikey`    | API キー（例: `demo-api-key`） |
| `X-User-Id` | ユーザー ID                    |

## エンドポイント一覧

| メソッド | パス                        | 概要                   |
| -------- | --------------------------- | ---------------------- |
| GET      | `/api/carts/`               | カート取得             |
| POST     | `/api/carts/items`          | 商品をカートに追加     |
| PATCH    | `/api/carts/items/{itemId}` | カート内商品の数量変更 |
| DELETE   | `/api/carts/items/{itemId}` | カートから商品を削除   |
| DELETE   | `/api/carts/`               | カートを空にする       |

## カート取得

カートが存在しない場合は自動作成されます。

```bash
curl http://localhost:8000/api/carts/ \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

### レスポンス例

```json
{
  "id": "clx...",
  "userId": "user-1",
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
```

## 商品をカートに追加

同じ商品が既にカートにある場合は数量が上書き（upsert）されます。

```bash
curl -X POST http://localhost:8000/api/carts/items \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-1",
    "quantity": 2,
    "price": 3500
  }'
```

### リクエストボディ

| フィールド  | 型     | 必須 | 説明    |
| ----------- | ------ | ---- | ------- |
| `productId` | string | Yes  | 商品 ID |
| `quantity`  | number | Yes  | 数量    |
| `price`     | number | Yes  | 単価    |

## カート内商品の数量変更

数量を 0 以下に設定すると商品が削除されます。

```bash
curl -X PATCH http://localhost:8000/api/carts/items/{itemId} \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 3}'
```

## カートから商品を削除

```bash
curl -X DELETE http://localhost:8000/api/carts/items/{itemId} \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```

## カートを空にする

```bash
curl -X DELETE http://localhost:8000/api/carts/ \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: {userId}"
```
