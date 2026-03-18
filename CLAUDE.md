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

```
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

全サービス → OTel Collector :4318 → Tempo（トレース）、Prometheus（メトリクス）、Loki（ログ）→ Grafana :3010。`NODE_OPTIONS: --require @opentelemetry/auto-instrumentations-node/register` によるゼロコード計装。

## 技術スタック

- **バックエンド:** Hono + @hono/zod-openapi（`/openapi.json` で OAS 3.1.0 を自動生成）、Prisma、MySQL、KafkaJS
- **フロントエンド:** Next.js 15、React 19、@vercel/otel でトレーシング
- **インフラ:** Kong Gateway 3.13（Konnect ハイブリッドモード）、Kong Event Gateway（Kafka プロキシ、ACL 制御）、Kafka、Docker Compose
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
- Kong の設定は `config/kong/kong.yml` の宣言型 YAML

## デモデータ

- **ユーザー:** `user@example.com` / `password123`（API キー: `demo-api-key`）、`admin@example.com` / `password123`（API キー: `admin-api-key`）
- **商品:** ゴリラテーマの12商品が自動シード

## ポート一覧

3000 フロントエンド | 3001-3006 各サービス | 3010 Grafana | 3100 Loki | 3200 Tempo | 8000 Kong Proxy | 8080 Kafka UI | 19092 Event Gateway (Order) | 19093 Event Gateway (Shipping)
