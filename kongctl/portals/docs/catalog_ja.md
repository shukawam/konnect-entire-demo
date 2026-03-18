# 商品カタログ API

## エンドポイント

### GET /api/products

- **概要:** 商品一覧を取得します。カテゴリや検索クエリでフィルタリングできます。
- **パラメータ:**
  - `category` (クエリ, 任意): カテゴリでフィルタリング。例: `バナナ`
  - `search` (クエリ, 任意): 商品名で検索。例: `ゴリラ`
  - `page` (クエリ, 任意): ページ番号。デフォルト: 1
  - `limit` (クエリ, 任意): 1ページの件数。デフォルト: 20、最大: 100
- **レスポンス:**
  - `200 OK`: 商品一覧（ページネーション付き）。
    - **スキーマ:** `ProductList`

### GET /api/products/{id}

- **概要:** ID で商品を取得します。
- **パラメータ:**
  - `id` (パス, 必須): 商品の ID。
- **レスポンス:**
  - `200 OK`: 商品詳細。
  - `404 Not Found`: 商品が見つかりません。

### POST /api/products

- **概要:** 新しい商品を作成します（管理者用）。
- **リクエストボディ:** `CreateProduct`
- **レスポンス:**
  - `201 Created`: 作成された商品。

## スキーマ

### Product

| 名前        | 型      | 説明           |
| ----------- | ------- | -------------- |
| id          | string  | 商品の ID      |
| name        | string  | 商品名         |
| description | string  | 商品の説明     |
| price       | integer | 商品の価格     |
| imageUrl    | string  | 商品画像の URL |
| category    | string  | 商品カテゴリ   |
| stock       | integer | 在庫数         |
| createdAt   | string  | 作成日時       |
| updatedAt   | string  | 更新日時       |

### ProductList

| 名前     | 型    | 説明          |
| -------- | ----- | ------------- |
| products | array | 商品の配列    |
| total    | int   | 総件数        |
| page     | int   | 現在のページ  |
| limit    | int   | 1ページの件数 |
