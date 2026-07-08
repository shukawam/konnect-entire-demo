# Cart API

ユーザーごとのカート操作を行う API です。curl は `/admin/api/carts` 経路に apikey を付けて呼び出します（X-User-Id は Kong が `curl-admin` として自動注入するため指定不要です）。

Base URL: `http://localhost:8000/admin/api/carts`

## 共通ヘッダー

| ヘッダー | 説明                                            |
| -------- | ----------------------------------------------- |
| `apikey` | API キー（既定: `jungle-store-demo-admin-key`） |

curl 経由のリクエストは Kong の request-transformer によって `X-User-Id: curl-admin` が自動注入されるため、呼び出し側で指定する必要はありません。

## エンドポイント一覧

| メソッド | パス                              | 概要                   |
| -------- | --------------------------------- | ---------------------- |
| GET      | `/admin/api/carts/`               | カート取得             |
| POST     | `/admin/api/carts/items`          | 商品をカートに追加     |
| PATCH    | `/admin/api/carts/items/{itemId}` | カート内商品の数量変更 |
| DELETE   | `/admin/api/carts/items/{itemId}` | カートから商品を削除   |
| DELETE   | `/admin/api/carts/`               | カートを空にする       |

## カート取得

カートが存在しない場合は自動作成されます。

```bash
curl http://localhost:8000/admin/api/carts/ \
  -H "apikey: jungle-store-demo-admin-key"
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
curl -X POST http://localhost:8000/admin/api/carts/items \
  -H "apikey: jungle-store-demo-admin-key" \
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
curl -X PATCH http://localhost:8000/admin/api/carts/items/{itemId} \
  -H "apikey: jungle-store-demo-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 3}'
```

## カートから商品を削除

```bash
curl -X DELETE http://localhost:8000/admin/api/carts/items/{itemId} \
  -H "apikey: jungle-store-demo-admin-key"
```

## カートを空にする

```bash
curl -X DELETE http://localhost:8000/admin/api/carts/ \
  -H "apikey: jungle-store-demo-admin-key"
```
