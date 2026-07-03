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
mise run sync-konnect              # config/kong/kong.yaml を decK で同期（CP: jungle-store-gateway）
cd kongctl && kongctl sync konnect # API / Portal / Event Gateway 等の Konnect リソースを同期
```

いずれも外部環境を変更する操作。実行前に diff（`deck gateway diff` / `kongctl plan`）をユーザーに提示して承認を得ること。詳細は `/sync-konnect` スキル参照。

## アーキテクチャ

```sh
ブラウザ :3000 (Next.js 15)
    → Kong Gateway :8000 (宣言型設定、DB レスモード)
        → /api/products  → Catalog Service :3001 (プロキシキャッシュ有効)
        → /api/carts     → Cart Service :3002 (API キー認証)
        → /api/orders    → Order Service :3003 (API キー認証、レート制限 10回/分)
        → /api/shipments → Shipping Service :3004 (API キー認証)
        → /api/users     → User Service :3005
        → /api/agent     → Agent Service :3006
```

### 非同期フロー（Kafka + Event Gateway）

Order Service → Event Gateway :19092 → Kafka → Event Gateway :19093 → Shipping Service。
Order Service が `order.created` を発行 → Shipping Service が配送を作成 → `order.status-updated` を発行 → Order Service がステータスを更新。
Kong Event Gateway がプロキシとして間に入り、サービスごとのトピック ACL を強制する。

### オブザーバビリティ

全サービス → otel-lgtm :4318（OTel Collector、Tempo（トレース）、Prometheus（メトリクス）、Loki（ログ）、Grafana をオールインワンで提供する `grafana/otel-lgtm` イメージ）→ Grafana :3010。`NODE_OPTIONS: --require @opentelemetry/auto-instrumentations-node/register` によるゼロコード計装。内蔵 Collector の設定は `config/observability/otel-lgtm/otelcol-config.yaml` で上書きし、ノイズ除去用の `filter/traces` と Kong AI メトリクス用の Prometheus スクレイプ（`kong:8100`）を保持している。

## 技術スタック

- **バックエンド:** Hono + @hono/zod-openapi（`/openapi.json` で OAS 3.1.0 を自動生成）、Prisma、MySQL、KafkaJS
- **フロントエンド:** Next.js 15、React 19、@vercel/otel でトレーシング
- **インフラ:** Kong Gateway 3.14（Konnect ハイブリッドモード）、Kong Event Gateway（Kafka プロキシ、ACL 制御）、Kafka、Docker Compose
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
- `.env`・`certs/`・`mise.toml` は機密のため編集/コミット禁止（環境変数の追加は `.env.example` を更新してユーザーに反映を依頼する）
- README.md にはプロジェクトの概要とセットアップ手順を記載し、CLAUDE.md には開発者向けの詳細なガイドラインを記載する（追記するべき内容があれば追記する）
- コミットメッセージはセマンティックコミット規約に従う（例: `feat: add new API endpoint for products`、`fix: resolve issue with user authentication`）
- ブランチ名もセマンティックに決定する（例: `feature/add-product-endpoint`、`bugfix/user-authentication-issue`）
- ローカルでの実装後に必ず、コードレビューを行い、その指摘が妥当であれば修正を行う

## Claude Code ハーネス（.claude/）

タスクの種類に応じて、以下のスキル・エージェントを使う:

### スキル（.claude/skills/）

- `add-endpoint` — バックエンドサービスへの API エンドポイント追加手順（TDD + Zod/createRoute パターン）
- `new-service` — 新規マイクロサービス作成のチェックリスト（compose.yaml / kong.yaml / DB 初期化まで）
- `verify-stack` — スタック全体のスモークテスト（ヘルスチェック、Kong プラグイン、Kafka フロー）
- `sync-konnect` — Konnect への設定反映（ユーザー実行専用。diff → 承認 → sync）

### サブエージェント（.claude/agents/）

実装タスクは「implementer（実装）→ verifier（独立検証）→ code-reviewer（レビュー）」のパイプラインで委譲できる:

- `implementer`（Sonnet）— 単一のスコープが明確な実装タスク。ファイルパスと受け入れ条件を明示して渡す
- `verifier`（Sonnet）— 実装後の独立検証。型チェック・テスト・スモークテストを実行し証拠付きで合否報告
- `code-reviewer`（Opus）— PR 作成前のレビュー。正確性 + プロジェクト規約準拠を file:line で指摘

### フック（.claude/hooks/、settings.json で有効化）

- 編集時に Prettier 自動整形 + サービス単位の型チェック（型エラーは即フィードバックされる）
- `.env` / `certs/` / `mise.toml` / `package-lock.json` の編集ブロック（フック + `permissions.deny` の二層。ガードレールであり完全な境界ではない）
- main ブランチへの直接コミット・強制 push のブロック（PreToolUse フックで即時検知、`.husky/pre-commit` / `.husky/pre-push` が実行時点で強制）
- フック変更時は `.claude/hooks/run-tests.sh` でリグレッションテストを実行する

## ドキュメント

- `guides/` — 各サービスの API ガイド、Getting Started、kongctl 手順
- `guides/demos/` — デモシナリオ（Gateway 基礎 / セキュリティ / AI Gateway / イベント駆動 / オブザーバビリティ / E2E 購入フロー）

## デモデータ

- **ユーザー:** `user@example.com` / `password123`（API キー: `demo-api-key`）、`admin@example.com` / `password123`（API キー: `admin-api-key`）
- **商品:** ゴリラテーマの12商品が自動シード

## ポート一覧

3000 フロントエンド | 3001-3006 各サービス | 3010 Grafana (otel-lgtm) | 4317 OTLP gRPC | 4318 OTLP HTTP | 8000 Kong Proxy | 8080 Kafka UI | 19092 Event Gateway (Order) | 19093 Event Gateway (Shipping)

> Tempo / Prometheus / Loki は otel-lgtm コンテナ内部に集約されており、個別ポートは公開していない（Grafana 3010 から参照する）。
