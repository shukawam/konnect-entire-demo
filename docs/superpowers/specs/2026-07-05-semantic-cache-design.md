# Semantic Cache の導入 設計ドキュメント

- Issue: #22 「Semantic Cache の導入」
- 日付: 2026-07-05
- ステータス: 設計合意済み

## 背景・目的

現状、LLM API 呼び出し（`agent-service` → Kong `/ai/v1` → OpenAI）には意味ベースのキャッシュが存在しない。デモ用に、意味的に近いプロンプトの応答を再利用する Semantic Cache 機構を導入し、コスト削減・レイテンシ短縮・アプリコード非依存という Kong AI Gateway の価値を実演する。

## 方針

Kong の `ai-semantic-cache` プラグインを `config/kong/kong.yaml` の `openai-route` に追加する **Kong 透過キャッシュのみ**の構成とする。既存の `ai-semantic-prompt-guard` が使う **redis + OpenAI embeddings（`text-embedding-3-small`）** をそのまま流用し、新規インフラは追加しない。agent-service / frontend / compose のコード変更は行わない。

## アーキテクチャ / 配置

```
agent-service / curl ─> Kong /ai/v1
    ├── ai-semantic-prompt-guard   (入力検証: 既存)
    ├── ai-semantic-cache          ★ 新規: 意味類似でキャッシュ応答
    ├── ai-prompt-decorator        (キャラ注入: 既存)
    └── ai-proxy-advanced          (OpenAI 転送: 既存 / キャッシュヒット時は未到達)
```

プラグイン順序: `ai-semantic-prompt-guard` が先に不正入力をブロックするため、不正プロンプトはキャッシュに載らない。Kong の AI プラグイン既定優先度でこの順序は担保される想定だが、実装時に `deck gateway diff` で実効順序を確認する。

## プラグイン設定

既存 `ai-semantic-prompt-guard` の `embeddings` / `vectordb` ブロックと対になる形で定義する。

```yaml
- name: ai-semantic-cache
  route: openai-route
  config:
    embeddings:
      auth:
        header_name: Authorization
        header_value: Bearer ${{ env "DECK_OPENAI_API_KEY" }}
      model:
        provider: openai
        name: text-embedding-3-small
    vectordb:
      strategy: redis
      distance_metric: cosine
      dimensions: 1536
      threshold: 0.1 # キャッシュは厳しめ（誤ヒット防止）。0.1〜0.2 で調整
      redis:
        host: redis
        port: 6379
    cache_ttl: 300 # 5分
```

- `threshold`: 「言い換えでもヒット」しつつ別質問を誤ヒットさせない値に調整（実装時に 0.1〜0.2 で検証）。
- `cache_ttl` やその他フィールド（exact/semantic 併用等）は実装時に `deck gateway diff` と Kong 3.14 のスキーマで最終確定する。

## デモドキュメント更新

`guides/demos/demo-scenario-ai-gateway.md` に新ステップ「Semantic Cache」を追加する（MCP ステップの前、AI Proxy 系プラグインの流れに沿う位置）。

- **見せ方**: 商品・一般質問で curl を2回投げ、1回目 `X-Cache-Status: Miss`（OpenAI 到達）→ 2回目（言い換えでも）`Hit`（OpenAI 未到達・高速）を示す。

  ```bash
  # 1回目: Miss
  curl -i -X POST http://localhost:8000/ai/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"どんな商品がありますか？"}]}'

  # 2回目: 言い換えでも Hit
  curl -i -X POST http://localhost:8000/ai/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"取り扱っている商品を教えて"}]}'
  ```

- **解説ポイント**: redis ベクトル DB + OpenAI embeddings で意味的に近いプロンプトを再利用 / コスト・レイテンシ削減 / アプリコード非依存。
- **⚠️ カバート明記**: キャッシュは**全ユーザー共有**のため、カート・注文などユーザー固有データを含む質問はデモ対象外（本番では consumer 単位のキャッシュ分離や user-specific データの除外が必要）。
- まとめ表に `Semantic Cache | ai-semantic-cache | 意味的に近い応答の再利用によるコスト/レイテンシ削減` の行を追加。
- Grafana ステップの補足: キャッシュヒット時は `kong_ai_llm_requests_total` の増加が止まる（＝OpenAI 未到達）ことを確認できる旨を追記。

## テスト・検証

- **構文/整合性**: `docker compose config -q`、`deck gateway diff`（プラグイン差分と実効順序の確認）、`npm run format:check`。
- **スモーク**: スタック起動後、上記 curl 2連投で `X-Cache-Status: Miss → Hit` とレイテンシ短縮を目視確認。`verify-stack` スキルに沿ってヘルスチェックも実施。
- kong.yaml の宣言的設定のみの変更で TypeScript コードは触らないため、サービス単体テスト（vitest）の追加対象はなし。
- Konnect への反映（`deck gateway sync`）は**ユーザー実行専用**。diff 提示 → 承認 → sync の手順（`sync-konnect` スキル）に従う。

## スコープ外（YAGNI）

- agent-service / frontend / compose のコード変更
- consumer 単位のキャッシュ分離、ユーザー固有データの除外ロジック（カバート明記で代替）
- redis の新規追加やクラスタ化（既存 redis を共有）
- キャッシュヒット率のカスタムダッシュボード作成（既存 AI メトリクスで代替）

## 影響ファイル

- `config/kong/kong.yaml`（`ai-semantic-cache` プラグイン追加）
- `guides/demos/demo-scenario-ai-gateway.md`（新ステップ + まとめ表）
