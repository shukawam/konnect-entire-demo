# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Kong Konnect デモ用 EC サイト。ゴリラをテーマにした e コマースアプリケーションで、Kong Gateway の機能（レート制限、キャッシュ、API キー認証、分散トレーシング）を実演する。マイクロサービスアーキテクチャで、Kafka による非同期メッセージングと完全なオブザーバビリティスタックを備える。

## コマンド

### 全サービス起動

```bash
docker compose up -d --build
```

### 個別サービスをローカルで起動

```bash
npm run dev:catalog    # port 3001
npm run dev:cart       # port 3002
npm run dev:order      # port 3003
npm run dev:shipping   # port 3004
npm run dev:user       # port 3005
npm run dev:agent      # port 3006
npm run dev:frontend   # port 3000
```

### データベース操作（全サービス一括）

```bash
npm run db:generate    # Prisma クライアント生成
npm run db:push        # スキーマを MySQL に反映
npm run db:seed        # デモデータ投入
```

### サービス単体（サービスディレクトリ内で実行）

```bash
npm run dev            # tsx watch src/index.ts
npm run build          # tsc
npm run db:generate    # prisma generate
npm run db:push        # prisma db push
npm run db:seed        # tsx prisma/seed.ts（catalog, user のみ）
```

## アーキテクチャ

```sh
ブラウザ :3000 (Next.js 15)
    → Keycloak :8081 で SSO ログイン（NextAuth/Auth.js）
    → Kong Gateway :8000 (宣言型設定、DB レスモード)
        → /api/products  → Catalog Service :3001 (プロキシキャッシュ有効)
        → /api/carts     → Cart Service :3002 (OIDC: JWT 検証)
        → /api/orders    → Order Service :3003 (OIDC: JWT 検証、レート制限 10回/分)
        → /api/shipments → Shipping Service :3004 (OIDC: JWT 検証)
        → /api/users     → User Service :3005 (OIDC: JWT 検証)
        → /api/agent     → Agent Service :3006
```

### エンドユーザー認証（Keycloak SSO + Kong OIDC）

エンドユーザー認証は Keycloak を IdP とした OpenID Connect の SSO。

- フロントエンドは **NextAuth (Auth.js v5)** の Keycloak provider でリダイレクト型ログイン（`services/frontend/src/auth.ts`）。アクセストークンはセッションに保持し、`/api/proxy` がサーバー側で `Authorization: Bearer` を付与して Kong へ送る（クライアントはトークンを扱わない）。
- Kong は **`openid-connect` プラグイン**（`auth_methods: [bearer]`）で JWT を検証し、claim を upstream ヘッダーへ注入する: `sub → X-User-Id`, `email → X-User-Email`, `preferred_username → X-User-Name`。各バックエンドは従来どおり `X-User-Id` でユーザーを識別する。
- **ブラウザとコンテナで到達 URL を分離する（`/etc/hosts` 不要）**: ブラウザは `localhost:8081`、コンテナ間は `keycloak:8081` で Keycloak に到達する。橋渡しは 2 点。① Keycloak に `KC_HOSTNAME=http://localhost:8081` + `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` を設定し、フロントチャネル（iss / 認可エンドポイント）は `localhost:8081` 固定、バックチャネル（token / jwks / userinfo）はリクエストホスト（コンテナからは `keycloak:8081`）を動的採用する。② Auth.js は `getAuthorizationUrl` が `wellKnown` を無視し `issuer` からサーバー側で discovery を fetch するため、`issuer` をブラウザ用 `localhost:8081` に保ったまま `customFetch`（`services/frontend/src/auth.ts`）でサーバー側 fetch 先だけを `keycloak:8081` に書き換える。これで token の `iss` は `localhost:8081`、Kong の JWKS 取得は `keycloak:8081` となり矛盾しない。
- Keycloak の realm はユーザーが作成・エクスポートし、`config/keycloak/realm-export.json` に配置すると起動時（`--import-realm`）に自動取り込みされる。realm 側 client の `secret` は `.env` の `AUTH_KEYCLOAK_SECRET` と完全一致させること（手順は `config/keycloak/README.md`）。

### 非同期フロー（Kafka + Event Gateway）

Order Service → Event Gateway :19092 → Kafka → Event Gateway :19093 → Shipping Service。
Order Service が `order.created` を発行 → Shipping Service が配送を作成 → `order.status-updated` を発行 → Order Service がステータスを更新。
Kong Event Gateway がプロキシとして間に入り、サービスごとのトピック ACL を強制する。

### オブザーバビリティ

全サービス → otel-lgtm :4318（OTel Collector、Tempo（トレース）、Prometheus（メトリクス）、Loki（ログ）、Grafana をオールインワンで提供する `grafana/otel-lgtm` イメージ）→ Grafana :3010。`NODE_OPTIONS: --require @opentelemetry/auto-instrumentations-node/register` によるゼロコード計装。内蔵 Collector の設定は `config/observability/otel-lgtm/otelcol-config.yaml` で上書きし、ノイズ除去用の `filter/traces` と Kong AI メトリクス用の Prometheus スクレイプ（`kong:8100`）を保持している。

## 技術スタック

- **バックエンド:** Hono + @hono/zod-openapi（`/openapi.json` で OAS 3.1.0 を自動生成）、Prisma、MySQL、KafkaJS
- **フロントエンド:** Next.js 15、React 19、@vercel/otel でトレーシング、NextAuth (Auth.js v5) で Keycloak SSO
- **インフラ:** Kong Gateway 3.14（Konnect ハイブリッドモード）、Kong Event Gateway（Kafka プロキシ、ACL 制御）、Kafka、Keycloak（エンドユーザー認証 IdP）、Docker Compose
- **モノレポ:** npm workspaces（`packages/*`、`services/*`）、共通 `tsconfig.base.json`（ES2022、ESNext モジュール）

## サービスの構造パターン

各バックエンドサービスは以下の構成に従う:

```bash
services/<名前>/src/
  index.ts       # Hono アプリ、ヘルスチェック、OAS ドキュメントエンドポイント
  routes.ts      # Zod スキーマ付き API ルート（@hono/zod-openapi）
  db.ts          # Prisma クライアント
  kafka.ts       # Kafka プロデューサー/コンシューマー（order, shipping のみ）
  consumer.ts    # Kafka イベントハンドラー（order, shipping のみ）
```

## 主要な規約

- Docker Compose ファイル名は `compose.yaml`（`docker-compose.yml` は使わない）
- Docker サービスには必ず `container_name` を設定する
- 設定ファイルは `config/<ツール名>/` に配置（例: `config/observability/tempo/`）
- OpenAPI 仕様は Zod スキーマから自動生成する（手書き禁止）
- OTel 計装は NODE_OPTIONS によるゼロコード方式を優先する
- Kong の設定は `config/kong/kong.yaml` の宣言型 YAML を使用し、decK を用いて管理する
- 実装は必ず適切なブランチを作成し、プルリクエストを通じてマージする（main ブランチへの直接コミット禁止）
- 新機能などの実装後は、必ずテストを追加する
- コードスタイルはプロジェクトの ESLint 設定に従う（Prettier も併用）
- README.md にはプロジェクトの概要とセットアップ手順を記載し、CLAUDE.md には開発者向けの詳細なガイドラインを記載する（追記するべき内容があれば追記する）
- コミットメッセージはセマンティックコミット規約に従う（例: `feat: add new API endpoint for products`、`fix: resolve issue with user authentication`）
- ブランチ名もセマンティックに決定する（例: `feature/add-product-endpoint`、`bugfix/user-authentication-issue`）
- ローカルでの実装後に必ず、コードレビューを行い、その指摘が妥当であれば修正を行う

## デモデータ

- **ユーザー:** Keycloak の realm 側で作成・管理する（`config/keycloak/README.md` 参照。例: `user@example.com` / `password123`、`admin@example.com` / `password123`）。ログイン後はトークンの `sub` が `X-User-Id` として各サービスへ渡る。
- **商品:** ゴリラテーマの12商品が自動シード

## ポート一覧

3000 フロントエンド | 3001-3006 各サービス | 3010 Grafana (otel-lgtm) | 4317 OTLP gRPC | 4318 OTLP HTTP | 8000 Kong Proxy | 8080 Kafka UI | 8081 Keycloak | 19092 Event Gateway (Order) | 19093 Event Gateway (Shipping)

> Tempo / Prometheus / Loki は otel-lgtm コンテナ内部に集約されており、個別ポートは公開していない（Grafana 3010 から参照する）。
