# Keycloak Realm 設定

エンドユーザー認証は Keycloak を IdP とした SSO（OpenID Connect）で行う。
このディレクトリに **エクスポートした realm の JSON** を置くと、Keycloak 起動時
（`start-dev --import-realm`）に自動でインポートされる。

```
config/keycloak/
  └── <realm>-realm.json   ← ここに realm エクスポートを配置（例: jungle-store-realm.json）
```

## 全体像

```
ブラウザ → NextAuth (Auth.js) → Keycloak(:8081) でログイン
  → access_token(JWT) を取得
バックエンド呼び出し:
  ブラウザ → Next.js proxy → Authorization: Bearer <token> → Kong(:8000)
    → openid-connect プラグインが JWT を検証し claim を upstream ヘッダーへ注入
      (sub → X-User-Id, email → X-User-Email, preferred_username → X-User-Name)
    → 各サービス(cart/order/shipping/user)
```

## ユーザーが Keycloak で行う設定（エクスポート前）

Keycloak 管理コンソール（http://localhost:8081 / 初期管理者は `.env` の
`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`）で以下を作成してからエクスポートする。

### 1. Realm

- 名前: **`jungle-store`**（`.env` の `KEYCLOAK_REALM` と一致させる）
- **Require SSL: `None`**（Realm settings → General/Login）。
  デモは HTTP で動かすため必須。これを `external`（既定）のままにすると、
  localhost / プライベート IP 以外からの HTTP アクセスで **「HTTPS required」** エラーになる。
  この設定は realm に保存されるのでエクスポートに含まれる。
- 必要に応じて「User registration」を有効化（セルフ登録を使う場合）

> **補足（master realm の「HTTPS required」）**: 管理コンソールに localhost 以外
> （LAN IP やホスト名）でアクセスすると `master` realm でも同じエラーが出る。
> その場合は realm セレクタで `master` を選び、同様に Require SSL を `None` にする。
> `master` はエクスポート対象外なので、コンテナを作り直すたびに再設定が必要
> （`http://localhost:8081` でアクセスすれば localhost 例外で回避できる）。

### 2. Client（NextAuth 用）

- Client ID: 任意（`.env` の `AUTH_KEYCLOAK_ID` と一致させる。例: `jungle-store-frontend`）
- Client authentication: **On**（confidential。secret を発行する）
- Standard flow: **有効**
- Valid redirect URIs: `http://localhost:3000/api/auth/callback/keycloak`
- Valid post logout redirect URIs: `http://localhost:3000`
- Web origins: `http://localhost:3000`
- Credentials タブの client secret を `.env` の `AUTH_KEYCLOAK_SECRET` に設定

> **重要**: realm エクスポートに client secret は含まれない（マスクされる）。
> secret は必ず `.env` の `AUTH_KEYCLOAK_SECRET` に手動で設定すること。
> realm 側の secret は固定値にしておくと再現性が高い。

### 3. ユーザー

デモ用に以下のようなユーザーを作成（email 必須・email verified 推奨）。

| Username / Email    | パスワード    | 備考         |
| ------------------- | ------------- | ------------ |
| `user@example.com`  | `password123` | 一般ユーザー |
| `admin@example.com` | `password123` | 管理者       |

ログイン後、トークンの `sub`（ユーザー ID）が `X-User-Id` として各サービスへ渡る。

## エクスポート手順

管理コンソール → Realm settings → 右上 **Action** → **Partial export**
（Clients / Users / Groups などを含めてエクスポート）→ ダウンロードした JSON を
`config/keycloak/<realm>-realm.json` として保存する。

または CLI:

```bash
docker exec -it keycloak /opt/keycloak/bin/kc.sh export \
  --dir /opt/keycloak/data/import --realm jungle-store --users realm_file
```

## 反映

```bash
docker compose up -d --build keycloak   # realm を再インポート
```

> 既存データを完全にクリーンインポートし直したい場合は、Keycloak コンテナを
> 作り直す（`docker compose rm -sf keycloak` 後に再起動）。dev モードのため
> データは H2 にコンテナ内保持される。
