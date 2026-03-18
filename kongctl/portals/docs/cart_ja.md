# カート API

全エンドポイントで `x-user-id` ヘッダーが必須です。

## エンドポイント

### GET /api/carts

- **概要:** ユーザーのカートを取得します。カートが存在しない場合は自動作成されます。
- **レスポンス:**
  - `200 OK`: カート情報（`Cart`）。
  - `401`: 認証エラー（`x-user-id` 未設定）。

### POST /api/carts/items

- **概要:** カートに商品を追加します。既に同じ商品がある場合は数量が加算されます。
- **リクエストボディ:** `AddItem`
- **レスポンス:**
  - `201 Created`: 更新されたカート。
  - `401`: 認証エラー。

### PATCH /api/carts/items/{itemId}

- **概要:** カート内の商品の数量を変更します。数量が0以下の場合は商品を削除します。
- **パラメータ:**
  - `itemId` (パス, 必須): カートアイテムの ID。
- **リクエストボディ:** `UpdateQuantity`
- **レスポンス:**
  - `200 OK`: 更新された商品。
  - `404 Not Found`: 商品が見つかりません。

### DELETE /api/carts/items/{itemId}

- **概要:** カートから商品を削除します。
- **パラメータ:**
  - `itemId` (パス, 必須): カートアイテムの ID。
- **レスポンス:**
  - `200 OK`: 削除完了メッセージ。
  - `404 Not Found`: 商品が見つかりません。

### DELETE /api/carts

- **概要:** カート内の全商品を削除し、カートを削除します。
- **レスポンス:**
  - `200 OK`: カートクリア完了メッセージ。
  - `404 Not Found`: カートが見つかりません。

## スキーマ

### Cart

| 名前      | 型     | 説明                   |
| --------- | ------ | ---------------------- |
| id        | string | カートの ID            |
| userId    | string | ユーザーの ID          |
| items     | array  | カート内の商品の配列   |
| createdAt | string | 作成日時               |
| updatedAt | string | 更新日時               |

### CartItem

| 名前      | 型      | 説明           |
| --------- | ------- | -------------- |
| id        | string  | アイテム ID    |
| cartId    | string  | カートの ID    |
| productId | string  | 商品の ID      |
| quantity  | integer | 商品の数量     |
| price     | integer | 商品の単価     |

### AddItem

| 名前      | 型      | 必須 | 説明       |
| --------- | ------- | ---- | ---------- |
| productId | string  | はい | 商品の ID  |
| quantity  | integer | はい | 数量       |
| price     | integer | はい | 単価       |

### UpdateQuantity

| 名前     | 型      | 必須 | 説明                           |
| -------- | ------- | ---- | ------------------------------ |
| quantity | integer | はい | 新しい数量（0以下で商品削除） |
