# Keycloak Realm 設定

エンドユーザー認証は Keycloak を IdP とした SSO（OpenID Connect）で行う。
このディレクトリに **エクスポートした realm の JSON** を置くと、Keycloak 起動時
（`start-dev --import-realm`）に自動でインポートされる。

```
config/keycloak/
  └── realm-export.json   ← ここに realm エクスポートを配置（ファイル名は任意の *.json）
```

## ホスト名の分離（/etc/hosts は不要）

ブラウザは `localhost:8081`、コンテナ間は `keycloak:8081` という**異なる URL**で Keycloak に到達する。
両者を以下の 2 点で橋渡しするため、`/etc/hosts` への追記は不要:

1. **Keycloak: `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`**（`compose.yaml`）
   - フロントチャネル（iss / 認可エンドポイント）は `KC_HOSTNAME=http://localhost:8081` に固定
   - バックチャネル（token / jwks / userinfo）はリクエストホストを動的採用 → コンテナからの
     アクセスでは `keycloak:8081` を返す。これで Kong は `keycloak:8081` で JWKS を取得できる。
2. **Auth.js: `customFetch`**（`services/frontend/src/auth.ts`）
   - Auth.js v5 の `getAuthorizationUrl` は `wellKnown` を無視し `issuer` から discovery を
     **サーバー側で** fetch する。`issuer` をブラウザ用 `localhost:8081` に保ったまま、
     `customFetch` で「サーバー側の fetch 先（discovery / token / jwks / userinfo）」だけを
     内部 URL `keycloak:8081` に書き換える。ブラウザへ返す認可 URL は `localhost:8081` のまま。

```
ブラウザ → localhost:8081 で認可・ログイン（公開ポート、/etc/hosts 不要）
frontend / Kong コンテナ → keycloak:8081 で discovery / token / jwks 取得（Docker DNS）
```

## 全体像

```
ブラウザ → NextAuth (Auth.js) → Keycloak(http://localhost:8081) でログイン
  → access_token(JWT) を取得
バックエンド呼び出し:
  ブラウザ → Next.js proxy → Authorization: Bearer <token> → Kong(:8000)
    → openid-connect プラグインが JWT を検証し claim を upstream ヘッダーへ注入
      (sub → X-User-Id, email → X-User-Email, preferred_username → X-User-Name)
    → 各サービス(cart/order/shipping/user)
```

> token の `iss` は `http://localhost:8081`（フロントチャネル固定）。Kong は内部 `keycloak:8081`
> から discovery を取得するが、`backchannel-dynamic` により iss は `localhost:8081`・JWKS URI は
> `keycloak:8081` として返るため、iss 検証と JWKS 取得が両立する。

## ユーザーが Keycloak で行う設定（エクスポート前）

Keycloak 管理コンソール（**http://localhost:8081** / 初期管理者は `.env` の
`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`）で以下を作成してからエクスポートする。

### 1. Realm

- 名前: **`jungle-store`**（`.env` の `KEYCLOAK_REALM` と一致させる）
- **Require SSL: `None`**（Realm settings → General/Login）。
  デモは HTTP で動かすため必須。これを `external`（既定）のままにすると、
  localhost / プライベート IP 以外からの HTTP アクセスで **「HTTPS required」** エラーになる。
  この設定は realm に保存されるのでエクスポートに含まれる。
- 必要に応じて「User registration」を有効化（セルフ登録を使う場合）

> このデモの `realm-export.json` は `sslRequired: "none"` を含むのでインポートだけで反映される。
>
> **master realm の「HTTPS required」は自動対応済み**: 管理コンソール（`http://localhost:8081`）が
> 動く `master` realm はエクスポート対象外で、`sslRequired` を設定する環境変数も Keycloak 26 には
> 無い。そこで `compose.yaml` の **`keycloak-init` コンテナ**が起動のたびに kcadm で
> `master` を `sslRequired=NONE` に更新する（コンテナを作り直しても毎回自動適用）。
> 手動で流す場合は `docker compose up keycloak-init`、または直接 kcadm:
>
> ```bash
> docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
>   --server http://localhost:8081 --realm master \
>   --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD"
> docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE
> ```

### 2. Client（NextAuth 用）

- Client ID: 任意（`.env` の `AUTH_KEYCLOAK_ID` と一致させる。例: `jungle-store-frontend`）
- Client authentication: **On**（confidential。secret を発行する）
- Standard flow: **有効**
- Valid redirect URIs: `http://localhost:3000/api/auth/callback/keycloak`
- Valid post logout redirect URIs: `http://localhost:3000`
- Web origins: `http://localhost:3000`
- Credentials タブの client secret を `.env` の `AUTH_KEYCLOAK_SECRET` に設定

> **重要**: client の `secret`（`realm-export.json` 内）と `.env` の `AUTH_KEYCLOAK_SECRET` は
> **完全一致**させること。1 文字でも違うとトークン交換が `unauthorized_client:
Invalid client credentials` で失敗する（末尾に余分な文字が混入しやすいので注意）。
> realm 側の secret は固定値にしておくと再現性が高い。

### 3. ユーザー

デモ用に以下のユーザーを `realm-export.json` の `users` に同梱済み（email verified・パスワード非 temporary）。

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
