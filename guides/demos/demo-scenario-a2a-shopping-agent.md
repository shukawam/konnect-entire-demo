# シナリオ 7: A2A ショッピングエージェント

Kong Gateway の **`ai-a2a-proxy`** プラグインを使って、Agent2Agent protocol（A2A、エージェント↔エージェント）を体感するデモです。既存の Ask AI（MCP、エージェント↔ツール）と対比しながら、複数の専門エージェントが Kong 経由で連携して「買い物」を完了するまでを確認します。

**対象:** AI エージェント連携に関心のある方、A2A / MCP の違いを知りたい方
**所要時間:** 15〜20分

---

## 概要: MCP と A2A の対比

- **MCP（Model Context Protocol、エージェント↔ツール）**: 既存の Ask AI は単一エージェントが Catalog/Cart/Order の各 API を「ツール」として MCP 経由で呼び出す構成（[シナリオ 4](demo-scenario-ai-gateway.md) 参照）。
- **A2A（Agent2Agent protocol、エージェント↔エージェント）**: 本シナリオの Agent モードは、Shopper Orchestrator（agent-service）が Agent Card を発見し、LLM の function calling で「商品提案」と「カート・注文確定」の専門エージェントへタスクを委譲する。専門エージェント自身も内部では MCP でツールを呼ぶため、**A2A と MCP は排他ではなく積層する**（オーケストレータ↔専門エージェントは A2A、専門エージェント↔バックエンド API は MCP）。

## 全体アーキテクチャ

```sh
ブラウザ Agent モード（AskAIDialog のトグル）
  → /api/proxy → Kong :8000 /api/agent/chat（OIDC: ユーザー JWT 検証、X-User-Id 注入）
    → agent-service = Shopper Orchestrator（A2A クライアント）
        │  Agent Card を Kong 経由で取得・キャッシュ（発見）
        │  LLM が Card の skills を読んで委譲先を選択（ルーティング）
        ├→ Kong /a2a/recommendation ── ai-a2a-proxy + key-auth + acl
        │     → recommendation-agent-service :3007（A2A サーバー）
        │         → LLM（Kong /ai/agent/v1）+ catalog MCP（Kong /mcp/products）
        └→ Kong /a2a/orders ── ai-a2a-proxy + key-auth + acl
              → order-agent-service :3008（A2A サーバー）
                  → LLM（Kong /ai/agent/v1）+ cart/order MCP（Kong /mcp/carts, /mcp/orders）
                      → 注文確定で既存の Kafka / Event Gateway / Shipping フローが発火
```

- `ai-a2a-proxy` プラグインが A2A(v0.3) リクエストを検出し、Agent Card の `url` を Gateway アドレスへ書き換え、タスク単位のメトリクス/トレース（`ai.a2a`）を記録する。
- エージェントの識別は **consumer + `key-auth` + `acl`**。`/a2a/*` は `orchestrators` グループ（consumer `shopper-agent`）のみ許可され、専門エージェント自身の consumer（`recommendation-agent` / `order-agent`、`specialist-agents` グループ）で叩くと ACL が 403 を返す（専門エージェント同士の直接通信を拒否するデモ）。
- ユーザーの識別は Kong OIDC が注入する `X-User-Id` → orchestrator が A2A メッセージの `metadata.userId` として専門エージェントへ伝搬 → 専門エージェントが MCP 呼び出しの `X-User-Id` に使う。
- 専門エージェントの LLM 応答は先頭マーカー（`[QUESTION]` → タスク状態 `input-required`、`[DONE]` → `completed`）でタスクのライフサイクルを制御する（`packages/a2a-support`）。
- **Phase 2（未実装、予定）:** Keycloak Standard Token Exchange によるユーザー権限委譲（jack は注文可、carl は権限不足で拒否、といった scope ベースの制御）。本シナリオは Phase 1（エージェント識別のみ）の範囲。

---

## 前提

- 全サービスが起動済み（`docker compose up -d --build`）
- Konnect 同期済み（差分ゼロを確認: `mise run gateway:diff`）
- ブラウザで http://localhost:3000 にアクセスし、`jack@example.com` / `password` でログイン済み

---

## ステップ 1: Agent モードで買い物をする

### 1-1. Agent モードを ON にする

1. 右下の **✨ Ask AI** を開く
2. ダイアログ上部の **🤖 Agent モード** トグルを ON にする
3. トグル ON 直後に `GET /api/agent/agents` で発見済みエージェント一覧が取得され、ダイアログに表示される（A2A の「発見」フェーズの可視化）

### 1-2. 好みをヒアリングされる（Recommendation Agent、input-required）

チャットに入力:

```sh
アウトドアで使えるマグカップを探してる
```

**Recommendation Agent** バッジ付きで質問が返る（例:「コーヒー用ですか？保温性は重視しますか？」）。応答の `state` は `input-required` で、「Recommendation Agent が入力を待っています…」と表示される。

### 1-3. 商品提案を受け取る（completed）

```sh
コーヒー用で、保温性重視
```

同じタスク（`taskId`）が再開され、条件に合う商品が提案される（`state: completed`）。提案テキストには商品名・価格・提案理由が含まれる。

### 1-4. 注文する（Order Agent、input-required → completed）

```sh
それを2つ注文して
```

**Order Agent** バッジで最終確認が返る（例:「合計 ¥X で注文しますか？」、`state: input-required`）。委譲先が Recommendation Agent から Order Agent に切り替わったことをバッジで確認する。

```sh
はい
```

`state: completed` で注文が確定する。

### 1-5. 非同期フローを確認する

1. 画面の注文履歴で新しい注文が `CONFIRMED` になっていることを確認
2. Kafka UI（http://localhost:8080）で `order.created` トピックに新しいメッセージが発行されていることを確認（既存の [イベント駆動シナリオ](demo-scenario-event-driven.md) と同じ非同期フロー）

### 解説ポイント

- 「好み → 数量 → 最終確認 → 注文」の各ステップは A2A のタスクライフサイクル（`input-required` によるマルチターン、`completed`）に対応しており、プレーンな HTTP API との違いを示す
- 委譲先の切り替え（Recommendation → Order）はオーケストレータの LLM が Agent Card の `skills` 記述を読んで判断しており、ハードコードされたルーティングではない
- 注文確定後は既存の Kafka / Event Gateway / Shipping フローがそのまま流れる（A2A はあくまで「注文するまで」の会話体験を担い、確定後のバックエンド処理は変更していない）

---

## ステップ 2: ACL デモ（curl）

`/a2a/*` は `key-auth` + `acl`（`allow: orchestrators`）で保護されている。consumer によって結果が変わることを curl で確認する。

```bash
# A2A: Agent Card が Kong 経由で取得でき、url が Gateway アドレスに書き換わっている
curl -s -H "apikey: jungle-store-shopper-agent-key" \
  http://localhost:8000/a2a/recommendation/.well-known/agent-card.json | jq -r .url
# 期待値: kong ホスト（例 http://localhost:8000/a2a/recommendation/ 相当）。
# サービス内部 URL (recommendation-agent-service:3007) のままなら ai-a2a-proxy の書き換えが効いていない

# A2A: 認証なしは 401
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:8000/a2a/recommendation/.well-known/agent-card.json
# 期待値: 401

# A2A ACL: 専門エージェントのキーでは 403（orchestrators グループのみ許可）
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: jungle-store-recommendation-agent-key" \
  http://localhost:8000/a2a/orders/.well-known/agent-card.json
# 期待値: 403
```

### 解説ポイント

- `shopper-agent`（orchestrators グループ）のキーは 200、無認証は 401、専門エージェント自身のキー（specialist-agents グループ）は 403 — 「誰が呼んでいるか」を Kong の設定だけで制御している
- 専門エージェント同士は直接通信できない設計になっており（常にオーケストレータ経由）、ACL がそれを実行時に強制する

---

## ステップ 3: オブザーバビリティ

### 3-1. Grafana（Tempo）で `ai.a2a` スパンを確認

1. Grafana（http://localhost:3010）→ Explore → Tempo
2. `Service Name: kong` などで A2A リクエストのトレースを検索し、`ai.a2a` スパンを開く
3. スパン属性でタスク状態（`input-required` / `completed` 等）と JSON-RPC メソッド（`message/send` 等）を確認する

> 専門エージェント（recommendation-agent-service / order-agent-service）は他サービスの `NODE_OPTIONS` ゼロコード計装ではなく、agent-service と同じ volcano SDK（`createVolcanoTelemetry`）でトレース/メトリクスを送信する。同じ OTel Collector（otel-lgtm）に集約されるが、Grafana で見えるのは volcano SDK が出すエージェント実行のスパン/メトリクスのみで、他サービスにある自動計装の HTTP スパンや Loki のログは含まれない。Gateway 側の `ai.a2a` スパン（Kong 由来）と合わせて追う。

### 3-2. Konnect アナリティクスでエージェント別トラフィックを確認

Konnect の Analytics（Advanced Analytics）で consumer 別（`shopper-agent` / `recommendation-agent` / `order-agent`）のトラフィックを絞り込み、正常な委譲呼び出し（200）と ACL で拒否されたリクエスト（403）が consumer ごとに分かれて記録されていることを確認する。

### 解説ポイント

- `ai-a2a-proxy` は通常の Kong ルートと同じくトレース・メトリクス・Konnect アナリティクスの対象になり、A2A 特有の「タスク状態」「JSON-RPC メソッド」もあわせて可視化される
- consumer 単位の可視化により「どのエージェントがどれだけ Gateway を通ったか」を後から追跡できる

---

## まとめ

このシナリオで確認した内容:

| 要素                 | 技術                            | 効果                                           |
| -------------------- | ------------------------------- | ---------------------------------------------- |
| エージェント間通信   | A2A v0.3（JSON-RPC）            | エージェント↔エージェントの標準プロトコル      |
| Gateway プロキシ     | `ai-a2a-proxy`                  | Agent Card URL 書き換え、A2A 専用の可観測性    |
| エージェント識別     | consumer + `key-auth` + `acl`   | 「誰が呼べるか」を Kong の設定だけで制御       |
| ユーザー識別の伝搬   | `X-User-Id` → `metadata.userId` | A2A タスクをまたいでユーザーコンテキストを維持 |
| タスクライフサイクル | `input-required` / `completed`  | マルチターンの対話をプロトコルレベルで表現     |

Kong の A2A Gateway 機能により、複数の AI エージェントが連携するアーキテクチャにも、既存の API/AI Gateway と同様のセキュリティ・可視性・ガバナンスを適用できます。
