# User API

ユーザー登録・ログイン・プロフィール操作を行う API です。
登録・ログインは認証不要、プロフィール操作には `X-User-Id` ヘッダーが必要です。

Base URL: `http://localhost:8000/api/users`

## エンドポイント一覧

| メソッド | パス | 認証 | 概要 |
|----------|------|------|------|
| POST | `/api/users/register` | 不要 | ユーザー登録 |
| POST | `/api/users/login` | 不要 | ログイン |
| GET | `/api/users/me` | `X-User-Id` | プロフィール取得 |
| PATCH | `/api/users/me` | `X-User-Id` | プロフィール更新 |

## ユーザー登録

```bash
curl -X POST http://localhost:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "gorilla@example.com",
    "name": "テストゴリラ",
    "password": "password123"
  }'
```

### リクエストボディ

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| `email` | string | Yes | メールアドレス（一意） |
| `name` | string | Yes | ユーザー名 |
| `password` | string | Yes | パスワード（6 文字以上） |

### レスポンス例

```json
{
  "id": "clx...",
  "email": "gorilla@example.com",
  "name": "テストゴリラ",
  "apiKey": "generated-api-key"
}
```

メールアドレスが重複している場合は `409` が返ります。

## ログイン

```bash
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### レスポンス例

```json
{
  "id": "clx...",
  "email": "user@example.com",
  "name": "ゴリラ太郎",
  "apiKey": "demo-api-key"
}
```

認証失敗時は `401` が返ります。

## プロフィール取得

```bash
curl http://localhost:8000/api/users/me \
  -H "X-User-Id: {userId}"
```

### レスポンス例

```json
{
  "id": "clx...",
  "email": "user@example.com",
  "name": "ゴリラ太郎",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

## プロフィール更新

```bash
curl -X PATCH http://localhost:8000/api/users/me \
  -H "X-User-Id: {userId}" \
  -H "Content-Type: application/json" \
  -d '{"name": "ゴリラ次郎"}'
```

### リクエストボディ

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| `name` | string | No | 新しいユーザー名 |
| `email` | string | No | 新しいメールアドレス |
