# Catalog API

商品の一覧取得・詳細取得・登録を行う API です。認証不要で利用できます。
Kong Gateway 経由でアクセスする場合、GET リクエストは 30 秒間プロキシキャッシュされます。

Base URL: `http://localhost:8000/api/products`

## エンドポイント一覧

| メソッド | パス                 | 概要         |
| -------- | -------------------- | ------------ |
| GET      | `/api/products/`     | 商品一覧取得 |
| GET      | `/api/products/{id}` | 商品詳細取得 |
| POST     | `/api/products/`     | 商品登録     |

## 商品一覧取得

```bash
curl http://localhost:8000/api/products/
```

### クエリパラメータ

| パラメータ | 型     | デフォルト | 説明                             |
| ---------- | ------ | ---------- | -------------------------------- |
| `category` | string | -          | カテゴリでフィルタ               |
| `search`   | string | -          | 名前・説明文で検索               |
| `page`     | number | 1          | ページ番号                       |
| `limit`    | number | 20         | 1 ページあたりの件数（最大 100） |

### レスポンス例

```json
{
  "products": [
    {
      "id": "clx...",
      "name": "ゴリラ T シャツ",
      "description": "最高級のゴリラプリント",
      "price": 3500,
      "imageUrl": "https://example.com/gorilla-tshirt.png",
      "category": "apparel",
      "stock": 100,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

### フィルタ・検索の例

```bash
# カテゴリで絞り込み
curl "http://localhost:8000/api/products/?category=apparel"

# キーワード検索
curl "http://localhost:8000/api/products/?search=ゴリラ"

# ページネーション
curl "http://localhost:8000/api/products/?page=2&limit=5"
```

## 商品詳細取得

```bash
curl http://localhost:8000/api/products/{id}
```

### レスポンス例

```json
{
  "id": "clx...",
  "name": "ゴリラ T シャツ",
  "description": "最高級のゴリラプリント",
  "price": 3500,
  "imageUrl": "https://example.com/gorilla-tshirt.png",
  "category": "apparel",
  "stock": 100,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

商品が見つからない場合は `404` が返ります。

## 商品登録

```bash
curl -X POST http://localhost:8000/api/products/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ゴリラマグカップ",
    "description": "朝のコーヒーをゴリラと一緒に",
    "price": 1500,
    "imageUrl": "https://example.com/gorilla-mug.png",
    "category": "goods",
    "stock": 50
  }'
```

### リクエストボディ

| フィールド    | 型     | 必須 | 説明                    |
| ------------- | ------ | ---- | ----------------------- |
| `name`        | string | Yes  | 商品名                  |
| `description` | string | Yes  | 商品説明                |
| `price`       | number | Yes  | 価格                    |
| `imageUrl`    | string | Yes  | 画像 URL                |
| `category`    | string | Yes  | カテゴリ                |
| `stock`       | number | No   | 在庫数（デフォルト: 0） |
