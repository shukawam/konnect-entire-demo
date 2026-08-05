---
name: verify-stack
description: Use when verifying the demo stack works end-to-end — after implementation changes, before a demo, when the user says「動作確認して」「スモークテストして」, or when a service seems down (connection refused, 401/502/503 from Kong).
---

# スタック全体の動作確認（スモークテスト）

## 認証モデル（前提知識）

- **ブラウザ経路** `/api/carts|orders|shipments|users`: Kong の `openid-connect` プラグインが Keycloak 発行の JWT（`Authorization: Bearer`）を検証。curl でトークンなしに叩くと **401 が正常**。
- **curl 向け経路** `/admin/api/carts|orders|shipments|users`: `key-auth`（`apikey: jungle-store-demo-admin-key`）。`request-transformer` が `X-User-Id: curl-admin` を固定注入するため **x-user-id ヘッダは不要**。
- `/api/products` は認証不要（proxy-cache 有効）。

## 実行方法

同梱のスクリプトを実行する（読み取り専用。Kafka フロー確認は注文を 1 件作成するため `--with-order` でオプトイン）:

```bash
bash .claude/skills/verify-stack/smoke.sh              # 基本チェック
bash .claude/skills/verify-stack/smoke.sh --with-order # + Kafka 非同期フロー確認
```

結果は「チェック名: OK/NG + 証拠」で出力される。NG があれば `docker compose logs --tail 50 <container_name>` で根本原因を調べて報告する（再起動で握りつぶさない）。

## 手動デバッグ用コマンド

```bash
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
curl -s -D - -o /dev/null http://localhost:8000/api/products | grep -iE 'HTTP|X-Cache'   # キャッシュ確認
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/orders/               # 401 = OIDC 正常
curl -s -o /dev/null -w '%{http_code}\n' -H 'apikey: jungle-store-demo-admin-key' \
  http://localhost:8000/admin/api/orders/                                                # 200 = admin 経路正常
```

## A2A（エージェント間通信）のスモーク

`/a2a/recommendation`（recommendation-agent-service :3007）と `/a2a/orders`（order-agent-service :3008）は `ai-a2a-proxy` + `key-auth` + `acl`（`allow: orchestrators`）で保護されている。consumer `shopper-agent`（orchestrators グループ）のキーのみ通過し、専門エージェント自身の consumer（`recommendation-agent` / `order-agent`、specialist-agents グループ）は ACL で 403 になる（専門エージェント同士の直接通信を拒否するデモ）。

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

# A2A ヘルス: 専門エージェント本体
curl -s http://localhost:3007/health
curl -s http://localhost:3008/health
# 期待値: {"status":"ok"}
```

## 判定基準

- サービス直叩き（:3001-3006 `/health`）で FAIL → そのサービスのログを見て根本原因を報告
- `/api/orders/` がトークンなしで 401 以外 → openid-connect 設定が消えている/Keycloak (:8081) 停止の可能性
- `/admin/api/*` が 401 → kong.yaml の consumer `curl-admin` / key-auth 設定を確認
- レート制限（10回/分）は OIDC 側の `order-service` に付いており、admin 経路では発火しない。curl で検証するには Keycloak からトークン取得が必要（通常はフロントエンド経由で確認する）
- `/a2a/*` の Agent Card 取得で `url` がサービス内部アドレス（`recommendation-agent-service:3007` 等）のまま → `ai-a2a-proxy` プラグインが route に付いていない、または Kong の再起動漏れ
- `/a2a/*` が 401 のはずが 200 で通ってしまう → `key-auth` 設定漏れ。403 が期待の箇所で 200 になる → `acl` の `allow` 設定漏れ
- :3007 / :3008 の `/health` が FAIL → `docker compose logs --tail 50 recommendation-agent-service` / `order-agent-service` で LLM/MCP 接続エラーを確認
