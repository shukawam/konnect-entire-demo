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

## 判定基準

- サービス直叩き（:3001-3006 `/health`）で FAIL → そのサービスのログを見て根本原因を報告
- `/api/orders/` がトークンなしで 401 以外 → openid-connect 設定が消えている/Keycloak (:8081) 停止の可能性
- `/admin/api/*` が 401 → kong.yaml の consumer `curl-admin` / key-auth 設定を確認
- レート制限（10回/分）は OIDC 側の `order-service` に付いており、admin 経路では発火しない。curl で検証するには Keycloak からトークン取得が必要（通常はフロントエンド経由で確認する）
