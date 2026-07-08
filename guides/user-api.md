# User API

ログイン中のユーザー自身のプロフィールを返す API です。

認証・ユーザー管理は **Keycloak SSO + Kong の `openid-connect` プラグイン**が担います。Kong が検証済みトークンの claim を upstream ヘッダーへ注入し（`sub → X-User-Id`, `email → X-User-Email`, `preferred_username → X-User-Name`）、User Service はそのヘッダーから本人情報を返すのみです。**パスワードや API キーは User Service では管理しません**（ユーザーの作成・パスワードは Keycloak realm 側で管理する。`config/keycloak/README.md` 参照）。

Base URL: `http://localhost:8000/api/users`

## エンドポイント一覧

| メソッド | パス            | 認証         | 概要             |
| -------- | --------------- | ------------ | ---------------- |
| GET      | `/api/users/me` | Keycloak JWT | プロフィール取得 |

## プロフィール取得

ブラウザ経路（`/api/users/me`）は Keycloak の JWT（OIDC）が必要です。通常はフロントエンドがログインセッションのアクセストークンを `Authorization: Bearer` として付与します。

```bash
curl http://localhost:8000/api/users/me \
  -H "Authorization: Bearer <access_token>"
```

curl から JWT を取得せずに試したい場合は、API キー経路 `/admin/api/users/me` を使います（`apikey` ヘッダーで認証し、Kong が `X-User-Id: curl-admin` を注入します）。

```bash
curl http://localhost:8000/admin/api/users/me \
  -H "apikey: jungle-store-demo-admin-key"
```

### レスポンス例

以下はブラウザ経路（jack でログインした JWT）の例です。API キー経路（`/admin/api/users/me`）では Kong が固定注入する `curl-admin` が返ります（`id`/`email`/`name` がすべて `curl-admin` 系の値になる）。

```json
{
  "id": "b0e1...",
  "email": "jack@example.com",
  "name": "jack"
}
```

| フィールド | 型     | 説明                                               |
| ---------- | ------ | -------------------------------------------------- |
| `id`       | string | ユーザー ID（トークンの `sub` = `X-User-Id`）      |
| `email`    | string | メールアドレス（`X-User-Email`）                   |
| `name`     | string | ユーザー名（`preferred_username` = `X-User-Name`） |

`X-User-Id` が無い（= 未認証の）場合は `401` が返ります。
