---
name: cross-service-contracts
description: Use when planning or reviewing a change that crosses service boundaries — renaming/moving Kafka topics or event payload fields, Kong route paths, X-User-* headers, Prisma schema fields, compose.yaml anchors, consumer groups — or when asking「他にどこを直す必要がある?」during refactoring.
---

# サービス間コントラクト（暗黙の契約）マップ

## 原則

このリポジトリのサービス間契約は**型で繋がっていない**。producer/consumer のペイロード、Kong ルートとフロントエンドのパス、ヘッダ名、他サービスの API レスポンス形状は、すべて各所に**文字列リテラル/インライン型として重複定義**されている。片側だけ変更してもコンパイルエラーにならず、実行時に静かに壊れる。変更前にこの表で連動箇所を洗い出し、変更後は `grep -rn '<旧識別子>' --exclude-dir=node_modules .` がゼロ件になることを確認する。

## 罠: packages/shared は見た目ほど中央ではない

`packages/shared` の `types/`（Product/Order/イベント型）と `kafka/`（`KAFKA_TOPICS` 等の定数）は**どのサービスからも import されていない死蔵コード**。実際に使われているのは `createLogger` / `createErrorHandler` / `createNotFoundHandler` のみ（これらの変更は全 6 サービスに波及する）。shared の型・定数だけ直して「リネーム完了」と判断しないこと。

## 変更 → 連動箇所チェックリスト

### Kafka トピック名 / consumer group 名

- 各サービスの `src/kafka.ts` `src/consumer.ts` のリテラル（order-service, shipping-service）
- `kongctl/event-gateways.yaml` の Virtual Cluster ACL `match:` ルール — **default-deny のため未更新だと "Topic authorization failed" で非同期フローだけが静かに死ぬ**（HTTP の注文作成は成功し続けるので気づきにくい）。反映は `/sync-konnect`
- `compose.yaml` の `kafka-init`（トピック作成コマンド）。既存 Kafka volume には旧トピックが残るため `docker compose down -v` か手動削除が必要
- 各サービスのテスト（`producer.send` のトピック名アサーション）
- ドキュメント: `guides/event-gateway.md`, `guides/demos/*`, `kongctl/portals/docs/*_ja.md`（ポータル公開物。反映に kongctl sync が必要）

### Kafka イベントペイロードのフィールド

- producer 側: order-service `src/routes.ts`（order.created）、shipping-service `src/consumer.ts`（order.status-updated）
- consumer 側: shipping-service `src/consumer.ts`、order-service `src/consumer.ts` — 手書きの分割代入 + if チェックのみで、スキーマ検証は存在しない
- 両側のテスト

### Kong ルートパス / strip_path

- `config/kong/kong.yaml`: ブラウザ経路は `strip_path: false`（パス = バックエンドのベースパス）、`/admin/api/*` は `strip_path: true` + `service.path` のリライト算術
- フロントエンドのハードコードパス: `services/frontend/src/` 配下の `apiFetch('/api/...')` 呼び出し（page.tsx, cart/page.tsx, orders/, Nav.tsx, AskAIDialog.tsx）
- バックエンドのルーターマウントパス（各 `routes.ts`）
- 反映は `/sync-konnect`

### X-User-Id / X-User-Email / X-User-Name ヘッダ

- `config/kong/kong.yaml`: openid-connect の `upstream_headers_names`、admin 経路の `request-transformer`、CORS の許可ヘッダ
- 読み取り側: cart/order/shipping の各 `routes.ts`（X-User-Id で 401/400 判定）、**user-service は 3 つ全部読んでユーザーを upsert する**（プロビジョニングが壊れる）

### Prisma スキーマ（他サービスから参照されるフィールド）

- catalog `Product.stock` / `.name` / `.price` — order-service が注文作成時に `/api/products/:id` を fetch して在庫検証に使う。フロントも `productId` から商品名を解決する
- cart のアイテム形状（`items[].productId/quantity/price`）— order-service が注文作成時に `/api/carts` を fetch して消費する
- `price` は全スキーマで `Int`（整数円）。`status` は自由文字列で、値の集合（PENDING/CONFIRMED/SHIPPED/DELIVERED）はフロントのラベル定義・shipping の consumer と暗黙に共有
- productId / userId / orderId は DB 間 FK なしの素の文字列参照（userId = Keycloak の `sub`）

### routes.ts / Zod スキーマ（公開 API の形状）

- ライブの `/openapi.json` は自動追従するが、**ポータル公開スペック `kongctl/portals/apis/<svc>/openapi.yaml` は手動コミットで自動生成されない** — ルート変更時は手動同期しないとポータルだけ古いまま残る
- フロントエンドはレスポンス型を各 page.tsx にインライン再定義している（`{ products, total }`、エラーは `{ error: string }`）

### compose.yaml

- `x-otel-env` アンカーは Prisma 系 5 サービスのみ継承。**agent-service と frontend は OTel 環境変数を手書きしているため、アンカー変更が波及しない**（recommendation-agent-service / order-agent-service も同様に手書きで、`NODE_OPTIONS` のゼロコード計装は使わず `createVolcanoTelemetry`（`src/volcano.ts`）で送信する）
- order/shipping の Kafka ブローカーはコードのデフォルト（localhost）ではなく `KAFKA_BROKER` 環境変数（event-gateway のリスナーポート、`kongctl/event-gateways.yaml` と対応）に依存

### A2A 境界（agent-service ↔ recommendation/order-agent-service）

- **Agent Card の skill id ↔ orchestrator の delegate プロンプト**: `recommendation-agent-service/src/card.ts` の `skills[0].id = 'product-recommendation'`、`order-agent-service/src/card.ts` の `skills[0].id = 'cart-and-order'`。agent-service（Shopper Orchestrator）は起動後に Kong 経由で Agent Card を取得し、LLM の function calling（`delegate` ツール）が `skills` の id/description を読んで委譲先を選ぶ。skill の説明文を変えると委譲判断の精度が変わるため、Card 側だけ変更して満足しないこと（挙動は実行して確認する）
- **`metadata.userId` ↔ 専門エージェントの MCP `X-User-Id`**: orchestrator は Kong OIDC が注入した `X-User-Id` を A2A メッセージの `message.metadata.userId` に詰めて送る。専門エージェント側は `MarkerAgentExecutor`（`packages/a2a-support/src/executor.ts`）が `ctx.userMessage.metadata?.userId` を読み、MCP 呼び出しの `X-User-Id` ヘッダーに使う。キー名 `userId` は両側の文字列リテラルで、型で繋がっていない
- **Kong consumer キー ↔ `A2A_API_KEY` env ↔ kong.yaml `keyauth_credentials`**: agent-service の `A2A_API_KEY`（compose 直書き、`jungle-store-shopper-agent-key`）は `config/kong/kong.yaml` の consumer `shopper-agent` の `keyauth_credentials[].key` と完全一致が必須。ここがずれると `/a2a/*` 全体が 401 になる。専門エージェント自身の consumer（`recommendation-agent` / `order-agent`）は `specialist-agents` グループのみで `orchestrators` に入れない — 入れてしまうと ACL 403 デモが壊れる
- **`A2A_RECOMMENDATION_URL` / `A2A_ORDER_URL` ↔ kong.yaml ルートパス**: agent-service の env（`http://kong:8000/a2a/recommendation`, `/a2a/orders`）は kong.yaml の `a2a-recommendation-route` / `a2a-order-route` の `paths`（`/a2a/recommendation`, `/a2a/orders`）と一致させる。ルートパスを変える場合は compose.yaml の env も同時に変更する
- **マーカープロトコル（`[QUESTION]` / `[DONE]`）↔ `MarkerAgentExecutor` のタスク状態遷移**: 専門エージェントの LLM 応答の先頭マーカーで `parseMarkedReply`（`packages/a2a-support/src/executor.ts`）がタスク状態を決める（`[QUESTION]` → `input-required`、`[DONE]` → `completed`、マーカーなしは `completed` 扱い）。system プロンプト側でこのマーカーを出力させる指示を変更・削除すると、意図せず全応答が `completed` 扱いになり、質問返し（マルチターン）が機能しなくなる

### MCP 境界（ai-mcp-proxy ↔ バックエンド API）

- **ツール定義の `path` ↔ MCP ループバック用ルート ↔ consumer `mcp-tools`**: `ai-mcp-proxy` はツール呼び出しを Kong 自身への新規リクエストとして発行する（UA `Kong/x.y MCP server`）。ブラウザ経路 `/api/*` は `openid-connect` 配下で MCP には JWT が無いため 401 になる。そこで cart / order は `/internal/mcp/carts` `/internal/mcp/orders`（services `mcp-backend-cart` / `mcp-backend-order`。`host=<既存 upstream>` + `path=<ベースパス>` + `strip_path: true` の /admin と同じ形）へ向け、`key-auth` で保護している。連動するのは 3 点で、いずれかを変えたら残りも直す: ①ツールの `path`、②ルートの `paths`、③ツールの静的ヘッダー `headers.apikey` と consumer `mcp-tools` の `keyauth_credentials[].key`（`jungle-store-mcp-tools-key`）。`/admin/api/*` は `request-transformer` が `X-User-Id` を `curl-admin` に固定上書きするため MCP からは使えない（ユーザーごとのカート/注文にならない）
- **ツールの `X-User-Id` パラメータ ↔ バックエンドの必須ヘッダー**: cart / order の各 API は `x-user-id` ヘッダーを必須とする。MCP 側は `parameters` の `in: header` / `required: true` で宣言し、呼び出しごとに LLM が渡す。この宣言を落とすと `inputSchema` が空になり、ツールは常に失敗する（バリデーションエラー）
- **`add-to-cart` のクエリパラメータ ↔ cart-service のフォールバック**: 本来は `request_body` で宣言すべきだが、decK が `type: json` フィールドのオブジェクト値を送信時に落とす（v1.64.0 / v1.65.1 で確認）ため Konnect に反映されない。回避として `services/cart-service` の `POST /api/carts/items` が「body が無いときだけ」クエリ `productId` / `quantity` / `price` を受理し、MCP 側は `parameters`(`in: query`) で宣言している。decK が修正されたら両方（kong.yaml のツール定義と cart-service のフォールバック）を戻すか判断すること

## 検証

連動箇所を直したら: 旧識別子の grep ゼロ確認 → 影響サービスの `tsc --noEmit` + テスト → `docker compose config -q`（compose 変更時）→ スタック起動中なら `/verify-stack`（Kafka フローは `--with-order`）。
