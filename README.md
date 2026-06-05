# Konnect Entire Demo

[![CI](https://github.com/shukawam/konnect-entire-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/shukawam/konnect-entire-demo/actions/workflows/ci.yml)

[English](./README.en.md)

Kong Konnect の各機能をフル活用したマイクロサービス構成の EC サイトデモです。
ゴリラをテーマにした商品データで、Kong API, AI, Event Gatewayを体験できます。

## アーキテクチャ

![architecture](/images/architecture.png)

## 技術スタック

| レイヤー           | 技術                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| フロントエンド     | Next.js 15.3, React 19, @vercel/otel, NextAuth (Auth.js v5)              |
| バックエンド       | Hono, @hono/zod-openapi, Prisma, KafkaJS                                 |
| 認証 (SSO)         | Keycloak (OpenID Connect IdP) + Kong `openid-connect` プラグイン         |
| AI エージェント    | @volcano.dev/agent, Kong AI Proxy + MCP Proxy                            |
| API Gateway        | Kong Gateway 3.14 (Konnect ハイブリッドモード)                           |
| Event Gateway      | Kong Event Gateway (Kafka プロキシ、ACL 制御)                            |
| データベース       | MySQL 8.0                                                                |
| キャッシュ         | Redis 8.0.2 (AI Prompt Guard 用ベクトル DB)                              |
| メッセージング     | Apache Kafka 3.7.0                                                       |
| オブザーバビリティ | grafana/otel-lgtm (Grafana + Tempo + Prometheus + Loki + OTel Collector) |
| 構成管理           | decK (Kong Gateway 設定), kongctl (Konnect 設定)                         |
| モノレポ           | npm workspaces (`packages/*`, `services/*`)                              |

## 前提条件

- Docker / Docker Compose
- Node.js 20+（ローカル開発時）
- Kong Konnect アカウント + クラスタ証明書（`certs/` に配置）

## セットアップ

### 環境変数

```bash
cp .env.example .env
```

`.env` を開き、以下の値を自分の環境に合わせて設定してください:

| 変数名                            | 説明                                          | 例                               |
| --------------------------------- | --------------------------------------------- | -------------------------------- |
| `CONTROL_PLANE_ID`                | Konnect コントロールプレーン ID               | `xxxxxxxx-xxxx-...`              |
| `EVENT_GATEWAY_CP_ID`             | Konnect Event Gateway コントロールプレーン ID | `xxxxxxxx-xxxx-...`              |
| `DECK_KONNECT_CONTROL_PLANE_NAME` | Konnect コントロールプレーン名                | `my-control-plane`               |
| `DECK_OPENAI_API_KEY`             | OpenAI API キー（AI Gateway 用）              | `sk-...`                         |
| `AUTH_SECRET`                     | NextAuth のセッション暗号鍵                   | `openssl rand -base64 32` で生成 |
| `AUTH_KEYCLOAK_ID`                | Keycloak クライアント ID                      | `jungle-store-frontend`          |
| `AUTH_KEYCLOAK_SECRET`            | Keycloak クライアントシークレット             | （Keycloak で発行）              |

その他の変数（MySQL, Kafka, サービス URL, Keycloak の URL/realm 等）はデフォルト値のままで動作します。

### Kong Konnect 証明書

Konnect コントロールプレーンのクラスタ証明書を `certs/` ディレクトリに配置してください。

### Keycloak（エンドユーザー認証）

エンドユーザー認証は Keycloak を IdP とした SSO（OpenID Connect）です。
Keycloak の realm（クライアント・ユーザー）は `config/keycloak/realm-export.json` に同梱されており、
起動時に自動インポートされます（`sslRequired: none`・デモユーザー 2 名・client 設定込み）。

> **`/etc/hosts` の編集は不要です。**
> ブラウザは `localhost:8081`、コンテナ間は `keycloak:8081` で Keycloak に到達します。
> Keycloak の `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` と Auth.js の `customFetch` により、
> フロントチャネル（iss / 認可）は `localhost:8081`、バックチャネル（discovery / token / jwks）は
> `keycloak:8081` に振り分けられます（詳細は [`config/keycloak/README.md`](config/keycloak/README.md)）。

同梱の realm をそのまま使う場合は、`.env` の `AUTH_KEYCLOAK_SECRET` を
`realm-export.json` の client `secret` と一致させるだけで動作します（既定値は設定済み）。

自分で realm を作り直す場合:

1. 一度 `docker compose up -d keycloak` で Keycloak を起動し、**`http://localhost:8081`**
   （管理者は `.env` の `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`）にログイン
2. realm `jungle-store`（Require SSL = None）、NextAuth 用クライアント、デモユーザーを作成
   （リダイレクト URI 等の要件は [`config/keycloak/README.md`](config/keycloak/README.md) 参照）
3. クライアントの secret を `.env` の `AUTH_KEYCLOAK_SECRET` と一致させる
4. realm をエクスポートして `config/keycloak/realm-export.json` として保存
5. 以降は `docker compose up -d --build` で realm が自動インポートされます

## クイックスタート

```bash
# 全サービス起動（初回はビルドに数分かかります）
docker compose up -d --build

# ステータス確認
docker compose ps

# 停止（データ保持）
docker compose down

# 停止 + データ削除（完全リセット）
docker compose down -v
```

## アクセス先一覧

| サービス       | URL                                                  | 用途                           |
| -------------- | ---------------------------------------------------- | ------------------------------ |
| フロントエンド | [http://localhost:3000](http://localhost:3000)       | EC サイト画面                  |
| Kong Gateway   | [http://localhost:8000](http://localhost:8000)       | 全 API のエントリーポイント    |
| Konnect        | [https://cloud.konghq.com](https://cloud.konghq.com) | コントロールプレーン（SaaS）   |
| Grafana        | [http://localhost:3010](http://localhost:3010)       | ダッシュボード（ログイン不要） |
| Kafka UI       | [http://localhost:8080](http://localhost:8080)       | Kafka トピック・メッセージ確認 |
| Keycloak       | [http://localhost:8081](http://localhost:8081)       | 認証 IdP / 管理コンソール      |

各バックエンドサービスは `/openapi.json` で OAS 3.1.0 を自動配信しています（例: [http://localhost:3001/openapi.json](http://localhost:3001/openapi.json)）。

## デモユーザー

ユーザーは Keycloak の realm 側で作成・管理します（[`config/keycloak/README.md`](config/keycloak/README.md) 参照）。
例として以下のユーザーを作成しておくと便利です。

| 名前                 | メール              | パスワード    |
| -------------------- | ------------------- | ------------- |
| ゴリラ太郎           | `user@example.com`  | `password123` |
| シルバーバック管理者 | `admin@example.com` | `password123` |

ログイン後はアクセストークン(JWT)の `sub` クレームが `X-User-Id` として各サービスへ渡ります。

## 基本操作フロー

### ブラウザから

1. [http://localhost:3000](http://localhost:3000) を開く
2. 「ログイン」→ Keycloak の画面にリダイレクト → デモユーザーで SSO ログイン
3. 商品一覧からカートに追加 → 注文確定
4. 注文ステータスの変化を確認: `PENDING` → `CONFIRMED` → `SHIPPED`

### curl で API を直接叩く

保護された API は Keycloak のアクセストークンを `Authorization: Bearer` で渡します。
（トークン取得には Keycloak クライアントで Direct Access Grants を有効化しておきます）

```bash
# 商品一覧（認証不要）
curl http://localhost:8000/api/products

# Keycloak からアクセストークンを取得
TOKEN=$(curl -s -X POST \
  http://localhost:8081/realms/jungle-store/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=jungle-store-frontend" \
  -d "client_secret=${AUTH_KEYCLOAK_SECRET}" \
  -d "username=user@example.com" \
  -d "password=password123" | jq -r .access_token)

# カートに商品追加（OIDC 認証必須。X-User-Id は Kong が token の sub から注入する）
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"productId":"prod-001","quantity":2,"price":1980}'

# 注文作成（Kafka → 発送自動作成）
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}"
```

## Kong Konnect 機能デモ

### Kong プラグイン一覧

| プラグイン                 | スコープ                    | 説明                                                          |
| -------------------------- | --------------------------- | ------------------------------------------------------------- |
| `cors`                     | グローバル                  | CORS ヘッダー制御                                             |
| `rate-limiting-advanced`   | グローバル                  | 60 req/min                                                    |
| `correlation-id`           | グローバル                  | `X-Request-Id` 自動付与                                       |
| `opentelemetry`            | グローバル                  | トレース・ログ・メトリクスを otel-lgtm へ送信                 |
| `openid-connect`           | Cart, Order, Shipping, User | Keycloak の JWT を検証し claim を upstream ヘッダーへ注入     |
| `rate-limiting`            | Order                       | 10 req/min（厳格制限）                                        |
| `proxy-cache`              | Catalog                     | GET レスポンスを 30 秒キャッシュ                              |
| `ai-semantic-prompt-guard` | AI Gateway                  | 許可/拒否ルールによる入力バリデーション（Redis + Embeddings） |
| `ai-prompt-decorator`      | AI Gateway                  | ゴリラキャラ「ゴリ助」のシステムプロンプト自動注入            |
| `ai-proxy-advanced`        | AI Gateway                  | OpenAI GPT-4o-mini への LLM プロキシ                          |
| `ai-mcp-proxy`             | MCP (3 ルート)              | Model Context Protocol によるツール提供                       |

### OpenID Connect 認証

```bash
# トークンなし → 401
curl -i http://localhost:8000/api/carts

# Bearer トークンあり → 200（${TOKEN} は前述の手順で取得）
curl -i http://localhost:8000/api/carts \
  -H "Authorization: Bearer ${TOKEN}"
```

Kong の `openid-connect` プラグインが JWT を検証し、`sub`/`email`/`preferred_username`
クレームを `X-User-Id`/`X-User-Email`/`X-User-Name` ヘッダーとして upstream へ注入します。

### Rate Limiting

```bash
# グローバル: 60 req/min、Order Service: 10 req/min
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8000/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}"
done
```

### Proxy Cache

```bash
# 初回: X-Cache-Status: Miss → 2回目: X-Cache-Status: Hit（30秒間キャッシュ）
curl -i http://localhost:8000/api/products
```

### Correlation ID

すべてのリクエストに `X-Request-Id` ヘッダーが自動付与されます。

## AI Gateway / AI エージェント

Agent Service（ポート 3006）は、Kong AI Gateway と MCP Proxy を活用した AI チャットボットです。

### 仕組み

1. **AI Proxy Advanced** — `/ai/v1` ルートで OpenAI GPT-4o-mini への LLM ゲートウェイを提供
2. **AI Prompt Decorator** — ゴリラキャラ「ゴリ助」のシステムプロンプトをリクエストに自動注入
3. **AI Semantic Prompt Guard** — Redis ベクトル DB + OpenAI Embeddings で不適切な入力をブロック
4. **AI MCP Proxy** — 商品検索・カート操作・注文履歴の MCP ツールを LLM に提供

### MCP ルート

| ルート          | 対象サービス | 提供ツール                     |
| --------------- | ------------ | ------------------------------ |
| `/mcp/products` | Catalog      | `list-products` — 商品一覧取得 |
| `/mcp/carts`    | Cart         | `get-cart` — カート内容取得    |
| `/mcp/orders`   | Order        | `list-orders` — 注文履歴取得   |

### AI チャットの試し方

フロントエンドの画面右下にある AI チャットダイアログから「ゴリ助」に質問できます。商品の検索、カートの確認、注文履歴の参照などを自然言語で行えます。

## 非同期イベント処理 (Kafka + Event Gateway)

注文から発送までの流れは Kafka を介した非同期処理です。**Kong Event Gateway** が Kafka プロキシとして間に入り、サービスごとのトピック ACL を制御します。

### トピック ACL

| サービス                      | 書き込み可能           | 読み取り可能           |
| ----------------------------- | ---------------------- | ---------------------- |
| Order Service (port 19092)    | `order.created`        | `order.status-updated` |
| Shipping Service (port 19093) | `order.status-updated` | `order.created`        |

### イベントフロー

1. Order Service が `order.created` を Event Gateway (19092) 経由で発行
2. Shipping Service が Event Gateway (19093) 経由で受信し、Shipment を作成 → `CONFIRMED`
3. 5秒後にステータスを `SHIPPED` に更新
4. `order.status-updated` を発行 → Order Service がステータスを反映

Kafka UI (http://localhost:8080) でメッセージの流れを確認できます。

## オブザーバビリティ

全サービスは [otel-lgtm](https://github.com/grafana/docker-otel-lgtm)（OTel Collector、Tempo（トレース）、Prometheus（メトリクス）、Loki（ログ）、Grafana を 1 コンテナに集約）経由でテレメトリを送信しています。Kong Gateway 自体も `opentelemetry` プラグインでトレース・ログ・メトリクスを送信します（Kong Gateway 3.14 以降では AI 関連メトリクスも OTLP 送信されます）。内蔵 Collector の設定は `config/observability/otel-lgtm/otelcol-config.yaml` で上書きし、ノイズ除去フィルタと Kong AI メトリクス用スクレイプを保持しています。

### トレースの確認

1. [Grafana](http://localhost:3010) → Explore → **Tempo** を選択
2. Service Name を選んでトレースを検索
3. Kong → バックエンドサービス → MySQL のスパンを確認

### ログの確認

1. Grafana → Explore → **Loki** を選択
2. `service_name` でフィルタ
3. TraceID リンクから Tempo にジャンプ可能

## Konnect 構成管理 (kongctl)

`kongctl/` ディレクトリには Konnect リソースの宣言型設定が格納されています。

| ファイル              | 内容                                                           |
| --------------------- | -------------------------------------------------------------- |
| `apis.yaml`           | 6 つの API 定義（Catalog, Cart, Order, Shipping, User, Agent） |
| `control-planes.yaml` | コントロールプレーン設定                                       |
| `event-gateways.yaml` | Event Gateway + トピック ACL 設定                              |
| `portals.yaml`        | 開発者ポータル設定                                             |
| `portal-teams.yaml`   | ポータルチーム設定                                             |
| `portals/`            | OAS スペック、API ドキュメント、ガイドページ                   |

## API リファレンス

各サービスの詳細な API リファレンスは `guides/` ディレクトリを参照してください。

- [Getting Started](guides/getting-started.md)
- [Catalog API](guides/catalog-api.md)
- [Cart API](guides/cart-api.md)
- [Order API](guides/order-api.md)
- [Shipping API](guides/shipping-api.md)
- [User API](guides/user-api.md)
- [Agent API](guides/agent-api.md)

## プロジェクト構成

```
├── packages/
│   └── shared/              # 共通型定義（Product, Cart, Order 等）、Kafka 定数
├── services/
│   ├── catalog-service/     # 商品 API (port 3001)
│   ├── cart-service/        # カート API (port 3002)
│   ├── order-service/       # 注文 API + Kafka プロデューサー/コンシューマー (port 3003)
│   ├── shipping-service/    # 配送 API + Kafka プロデューサー/コンシューマー (port 3004)
│   ├── user-service/        # ユーザー API (port 3005)
│   ├── agent-service/       # AI チャットエージェント (port 3006)
│   └── frontend/            # Next.js フロントエンド (port 3000)
├── config/
│   ├── kong/                # Kong Gateway 宣言型設定
│   ├── mysql/               # DB 初期化 SQL
│   └── observability/       # otel-lgtm（内蔵 OTel Collector）設定
├── kongctl/                 # Konnect リソース構成管理
├── guides/                  # API リファレンスガイド
└── certs/                   # Kong クラスタ証明書
```

## ローカル開発

Docker Compose を使わず個別サービスをローカルで起動する場合:

```bash
# 個別サービス起動
npm run dev:catalog    # port 3001
npm run dev:cart       # port 3002
npm run dev:order      # port 3003
npm run dev:shipping   # port 3004
npm run dev:user       # port 3005
npm run dev:agent      # port 3006
npm run dev:frontend   # port 3000

# データベース操作（全サービス一括）
npm run db:generate    # Prisma クライアント生成
npm run db:push        # スキーマ反映
npm run db:seed        # デモデータ投入

# コードフォーマット
npm run format         # Prettier で整形
npm run format:check   # フォーマットチェック

# テスト
npm run test           # 全サービスのテスト実行
npm run test:coverage  # カバレッジ付きテスト
```

### Docker Compose Watch（ホットリロード）

開発中はソースコード変更を自動反映できます:

```bash
docker compose watch
```

各サービスの `src/` 配下の変更はコンテナへ自動同期され、`package.json` や `prisma/schema.prisma` の変更時は自動リビルドされます。

## トラブルシューティング

### サービスが起動しない

```bash
docker compose ps
docker compose logs <service-name>
```

### MySQL / Kafka 接続エラー

起動に時間がかかることがあります。healthcheck が通るまで依存サービスは待機します。

### キャッシュされた古いビルドをクリア

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```
