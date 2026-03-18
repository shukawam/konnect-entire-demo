# ユーザー API

## エンドポイント

### POST /api/users/register

- **概要:** 新しいユーザーを登録します。API Key が自動生成されます。
- **リクエストボディ:** `RegisterRequest`
- **レスポンス:**
  - `201 Created`: ユーザー情報と API Key（`UserResponse`）。
  - `409 Conflict`: メールアドレスが既に登録されています。

### POST /api/users/login

- **概要:** メールアドレスとパスワードで認証します。
- **リクエストボディ:** `LoginRequest`
- **レスポンス:**
  - `200 OK`: ユーザー情報と API Key（`UserResponse`）。
  - `401`: 認証失敗。

### GET /api/users/me

- **概要:** ログインユーザーのプロフィールを取得します。`X-User-Id` ヘッダーが必要です。
- **レスポンス:**
  - `200 OK`: プロフィール情報（`UserProfile`）。
  - `401`: 認証エラー。
  - `404`: ユーザーが見つかりません。

### PATCH /api/users/me

- **概要:** ログインユーザーのプロフィールを更新します。`X-User-Id` ヘッダーが必要です。
- **リクエストボディ:** `UpdateProfileRequest`（name, email はどちらも任意）
- **レスポンス:**
  - `200 OK`: 更新後のプロフィール（`UserProfile`）。
  - `401`: 認証エラー。

## スキーマ

### RegisterRequest

| 名前     | 型     | 必須 | 説明                       |
| -------- | ------ | ---- | -------------------------- |
| email    | string | はい | メールアドレス             |
| name     | string | はい | ユーザー名（1文字以上）    |
| password | string | はい | パスワード（6文字以上）    |

### LoginRequest

| 名前     | 型     | 必須 | 説明             |
| -------- | ------ | ---- | ---------------- |
| email    | string | はい | メールアドレス   |
| password | string | はい | パスワード       |

### UserResponse

| 名前   | 型     | 説明                |
| ------ | ------ | ------------------- |
| id     | string | ユーザーの ID       |
| email  | string | メールアドレス      |
| name   | string | ユーザー名          |
| apiKey | string | API Key（認証用）   |

### UserProfile

| 名前      | 型     | 説明             |
| --------- | ------ | ---------------- |
| id        | string | ユーザーの ID    |
| email     | string | メールアドレス   |
| name      | string | ユーザー名       |
| createdAt | string | 作成日時         |
| updatedAt | string | 更新日時         |

### UpdateProfileRequest

| 名前  | 型     | 必須 | 説明               |
| ----- | ------ | ---- | ------------------ |
| name  | string | いいえ | ユーザー名       |
| email | string | いいえ | メールアドレス   |
