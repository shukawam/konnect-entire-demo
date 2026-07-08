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

### テスト・検証

```bash
npm run test                                 # 全ワークスペースのテスト（vitest）
npm run test -w services/order-service       # サービス単体のテスト
npx tsc --noEmit -p services/<名前>-service   # 型チェック（サービス単位）
npm run format:check                         # Prettier チェック（format で自動修正）
docker compose config -q                     # compose.yaml の構文検証
```

テストは各サービスの `src/__tests__/*.test.ts` に配置する（vitest、Prisma は `vi.mock('../db.js', ...)` でモック）。

### Kong / Konnect への設定反映

```bash
mise run gateway:diff              # config/kong/kong.yaml の適用前差分を表示（適用はしない）
mise run gateway:sync              # config/kong/kong.yaml を decK で同期（CP: jungle-store-gateway）
mise run konnect:diff              # kongctl/ の適用前差分を表示（適用はしない）
mise run konnect:sync              # API / Portal / Event Gateway 等の Konnect リソースを同期（--auto-approve）
```

いずれも sync は外部環境を変更する操作。実行前に対応する `diff` タスクの出力をユーザーに提示して承認を得ること。詳細は `/sync-konnect` スキル参照。

### 1コマンドセットアップ（`mise run setup`）

前提を「`.env` に `DECK_KONNECT_TOKEN`（Konnect PAT）を記入」「`.env` に `DECK_OPENAI_API_KEY` を記入」の 2 点まで縮小し、Konnect 同期から起動までを一括実行するオーケストレータ。認証は `.env` の `DECK_KONNECT_TOKEN` を単一 source of truth とし、mise が `.env` を読み込んで deck には環境変数 `DECK_KONNECT_TOKEN`、kongctl には `KONGCTL_DEFAULT_KONNECT_PAT` として供給する（`kongctl login` や `~/.config/deck/.deck.yaml` は不要。共有ヘルパ `setup_konnect_pat` が担う）。`.mise/tasks/` 配下のファイルベースタスクとして実装されている（`mise.toml`（内容は `[env]` で `.env` を読み込む設定のみ）はコミット対象。load-bearing なため事故防止にフックで直接編集をガードしている。サブディレクトリは `:` で名前空間化され、例えば `.mise/tasks/certs/gen` は `mise run certs:gen` になる）。

```bash
mise run setup                        # doctor → certs:gen → konnect:sync → env:patch → gateway:sync → up を一括実行
RESOURCE_PREFIX=e2e mise run setup    # 分離起動（既存 Konnect リソースと衝突しない e2e 用一式を作成）
RESOURCE_PREFIX=e2e mise run teardown # 分離環境の後始末（namespace 削除 + compose down -v + .env 復元）
```

各サブタスクは単体実行もでき、`setup` はその順次呼び出し:

- `doctor` — 前提チェック（`DECK_OPENAI_API_KEY` / `DECK_KONNECT_TOKEN` の設定と有効性を `kongctl get me` で検証 / Docker 起動）。不足があれば対処コマンドを提示して非 0 終了
- `certs:gen` — `certs/kong-gateway/` `certs/event-gateway/` に自己署名クラスタ証明書を生成（既存ファイルがあれば流用）
- `konnect:sync` — `kongctl sync` で Konnect リソース（CP / Event Gateway / API / Portal 等）を同期。証明書のピン留め（`data_plane_certificates`）を含む
- `env:patch` — `.env` の該当行のみを in-place で書き換え、`PREFIX` / `EVENT_GATEWAY_CP_ID` / `AUTH_SECRET` / `AUTH_KEYCLOAK_SECRET` 等の動的値・秘密値を反映する（他の行・コメントは保持）
- `gateway:sync` — `deck gateway sync config/kong/kong.yaml` を実行（`sync-konnect` タスクの後継。CP 名は `.env` を参照）
- `up` / `down` — `docker compose up -d --build` / `docker compose down` のラッパー
- `teardown` — `RESOURCE_PREFIX` 必須。対象 namespace の Konnect リソースを削除 + `docker compose down -v` + `.env` の分離値を既定へ戻す（本番 namespace 誤削除防止のため `RESOURCE_PREFIX` 未指定では失敗する）
- `selftest` — Konnect への接続不要なローカルテスト（レンダリングロジック等の単体検証）

共有ロジックは `.mise/lib/`（`common.sh`: `.env` パッチ関数・ログヘルパ、`render-kongctl.sh`: `RESOURCE_PREFIX` によるリソース名の接頭辞化レンダリング、`selftest.sh`）にまとまっている。

#### mise 非依存の入口（`Makefile`）

mise をインストールしたくない利用者向けに、リポジトリ直下の `Makefile` がコア導線（`make setup` / `make up` / `make down` / `make teardown`）を提供する。実体は `.mise/tasks/*` のシェルスクリプトで、mise と make の双方が同じスクリプトを呼び出す（ロジックの単一 source of truth）。各タスクスクリプトは元々 `env_get` / `setup_konnect_pat` で `.env` を自前で読むため mise の `[env]` 自動ロードにほぼ非依存で、唯一 `gateway:sync` が deck のテンプレート変数（`DECK_KEYCLOAK_ISSUER` / `DECK_OPENAI_API_KEY`）を環境から引く点だけは、当該スクリプト自身が `.env` から `export` して自己完結させている（mise 経由でも挙動は不変）。分離起動も `make setup RESOURCE_PREFIX=e2e` / `make teardown RESOURCE_PREFIX=e2e` で可能（Makefile が `export RESOURCE_PREFIX` するため、コマンドラインで渡した値が各スクリプトへ伝わる）。`make` の対象外は個別サブタスク（`doctor` / `certs:gen` 等の単体実行）のみで、これは mise 専用。CLI ツール（deck / kongctl / jq / yq / openssl / docker）の導入が別途必要な点は mise と同じ。

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
        → /admin/api/*   → cart/order/shipping/user (key-auth: apikey 認証、curl 向け)
```

### エンドユーザー認証（Keycloak SSO + Kong OIDC）

エンドユーザー認証は Keycloak を IdP とした OpenID Connect の SSO。

- フロントエンドは **NextAuth (Auth.js v5)** の Keycloak provider でリダイレクト型ログイン（`services/frontend/src/auth.ts`）。アクセストークンはセッションに保持し、`/api/proxy` がサーバー側で `Authorization: Bearer` を付与して Kong へ送る（クライアントはトークンを扱わない）。
- Kong は **`openid-connect` プラグイン**（`auth_methods: [bearer]`）で JWT を検証し、claim を upstream ヘッダーへ注入する: `sub → X-User-Id`, `email → X-User-Email`, `preferred_username → X-User-Name`。各バックエンドは従来どおり `X-User-Id` でユーザーを識別する。
- **ブラウザとコンテナで到達 URL を分離する（`/etc/hosts` 不要）**: ブラウザは `localhost:8081`、コンテナ間は `keycloak:8081` で Keycloak に到達する。橋渡しは 2 点。① Keycloak に `KC_HOSTNAME=http://localhost:8081` + `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` を設定し、フロントチャネル（iss / 認可エンドポイント）は `localhost:8081` 固定、バックチャネル（token / jwks / userinfo）はリクエストホスト（コンテナからは `keycloak:8081`）を動的採用する。② Auth.js は `getAuthorizationUrl` が `wellKnown` を無視し `issuer` からサーバー側で discovery を fetch するため、`issuer` をブラウザ用 `localhost:8081` に保ったまま `customFetch`（`services/frontend/src/auth.ts`）でサーバー側 fetch 先だけを `keycloak:8081` に書き換える。これで token の `iss` は `localhost:8081`、Kong の JWKS 取得は `keycloak:8081` となり矛盾しない。
- Keycloak の realm はユーザーが作成・エクスポートし、`config/keycloak/realm-export.json` に配置すると起動時（`--import-realm`）に自動取り込みされる。realm 側 client の `secret` は `.env` の `AUTH_KEYCLOAK_SECRET` と完全一致させること（手順は `config/keycloak/README.md`）。
- **`keycloak-init` コンテナ**（`kafka-init` と同じ init パターン）が起動のたびに kcadm で `master` realm の `sslRequired=NONE` を適用する。管理コンソール（`http://localhost:8081`）が動く `master` はエクスポート対象外で env でも設定できず、既定の `external` のままだと「HTTPS required」になるため。コンテナを作り直しても自動で再適用される。
- **curl 向けの API キー経路 `/admin/api/*`**: JWT を取得しない CLI/API クライアント向けに、`key-auth`（`apikey` ヘッダー）で保護した別経路を用意する。各 `*-admin-service`（host=既存 upstream、path=バックエンドのベースパス）に対しルートが `/admin` プレフィックスを `strip_path` し、`request-transformer` が JWT の代わりに `X-User-Id: curl-admin` を固定注入する。consumer `curl-admin` の API キーは `config/kong/kong.yaml` で管理。ブラウザ経路（OIDC）には影響しない純粋な追加。

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
- コードスタイルは Prettier に従う（husky + lint-staged で pre-commit 時に自動整形。ESLint は未導入）
- `.env`・`certs/` は機密のため編集/コミット禁止（環境変数の追加は `.env.example` を更新してユーザーに反映を依頼する）。`mise.toml` はコミット対象だが load-bearing のため直接編集はフックでブロックしている（変更が必要ならユーザーに依頼）
- README.md にはプロジェクトの概要とセットアップ手順を記載し、CLAUDE.md には開発者向けの詳細なガイドラインを記載する（追記するべき内容があれば追記する）
- コミットメッセージはセマンティックコミット規約に従う（例: `feat: add new API endpoint for products`、`fix: resolve issue with user authentication`）
- ブランチ名もセマンティックに決定する（例: `feature/add-product-endpoint`、`bugfix/user-authentication-issue`）
- ローカルでの実装後に必ず、コードレビューを行い、その指摘が妥当であれば修正を行う

## Claude Code ハーネス（.claude/）

タスクの種類に応じて、以下のスキル・エージェントを使う:

### スキル（.claude/skills/）

- `add-endpoint` — バックエンドサービスへの API エンドポイント追加手順（TDD + Zod/createRoute パターン）
- `new-service` — 新規マイクロサービス作成のチェックリスト（compose.yaml / kong.yaml / DB 初期化まで）
- `cross-service-contracts` — サービス間の暗黙契約マップ。サービス境界をまたぐ変更・リファクタリングの前に連動箇所（Kafka トピック ↔ Event Gateway ACL、Kong ルート ↔ フロントのパス、`X-User-*` ヘッダ等）を洗い出すためのリファレンス
- `create-pr` — 実装完了からの PR 作成フロー（検証 → code-reviewer レビュー → セマンティックコミット → gh pr create）
- `verify-stack` — スタック全体のスモークテスト（ヘルスチェック、Kong プラグイン、Kafka フロー）
- `sync-konnect` — Konnect への設定反映（ユーザー実行専用。diff → 承認 → sync）
- `kongctl-declarative` / `kongctl-extension-builder` — kongctl CLI が配布する公式スキル（実体は `.claude/skills/` 配下、`.agents/skills/` からシンボリックリンク。kongctl での再インストール時は配置先に注意）

### サブエージェント（.claude/agents/）

実装タスクは「implementer（実装）→ verifier（独立検証）→ code-reviewer（レビュー）」のパイプラインで委譲できる:

- `implementer`（Sonnet）— 単一のスコープが明確な実装タスク。ファイルパスと受け入れ条件を明示して渡す
- `verifier`（Sonnet）— 実装後の独立検証。型チェック・テスト・スモークテストを実行し証拠付きで合否報告
- `code-reviewer`（Opus）— PR 作成前のレビュー。正確性 + プロジェクト規約準拠を file:line で指摘

### フック（.claude/hooks/、settings.json で有効化）

- 編集時に Prettier 自動整形 + サービス単位の型チェック（型エラーは即フィードバックされる）+ 設定ファイルの構文検証（YAML は yq、JSON は node、compose ファイルは `docker compose config` によるスキーマ検証。構文エラーは編集時点でブロックされる）
- `.env` / `certs/` / `mise.toml` / `package-lock.json` の編集ブロック（フック + `permissions.deny` の二層。ガードレールであり完全な境界ではない）
- main ブランチへの直接コミット・強制 push のブロック（PreToolUse フックで即時検知、`.husky/pre-commit` / `.husky/pre-push` が実行時点で強制）
- フック変更時は `.claude/hooks/run-tests.sh` でリグレッションテストを実行する（CI の `Claude Code Hooks` ジョブでも毎 push 実行される）

## ドキュメント

- `guides/` — 各サービスの API ガイド、Getting Started、kongctl 手順
- `guides/demos/` — デモシナリオ（Gateway 基礎 / セキュリティ / AI Gateway / イベント駆動 / オブザーバビリティ / E2E 購入フロー）

## デモデータ

- **ユーザー:** Keycloak の realm 側で作成・管理する（`config/keycloak/README.md` 参照。例: `jack@example.com` / `password`、`carl@example.com` / `password`）。ログイン後はトークンの `sub` が `X-User-Id` として各サービスへ渡る。
- **商品:** ゴリラテーマの12商品が自動シード

## ポート一覧

3000 フロントエンド | 3001-3006 各サービス | 3010 Grafana (otel-lgtm) | 4317 OTLP gRPC | 4318 OTLP HTTP | 8000 Kong Proxy | 8080 Kafka UI | 8081 Keycloak | 19092 Event Gateway (Order) | 19093 Event Gateway (Shipping)

> Tempo / Prometheus / Loki は otel-lgtm コンテナ内部に集約されており、個別ポートは公開していない（Grafana 3010 から参照する）。
