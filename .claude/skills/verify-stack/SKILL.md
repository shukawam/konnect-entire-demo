---
name: verify-stack
description: Use when verifying the demo stack works end-to-end — after implementation changes, before a demo, when the user says「動作確認して」「スモークテストして」, or when a service seems down (connection refused, 502/503 from Kong).
---

# スタック全体の動作確認（スモークテスト）

## 手順

すべて読み取り専用。結果は「サービス名: OK/NG + 証拠」の表で報告する。

### 1. コンテナ状態

```bash
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
```

`Exited`/`Restarting` があれば `docker compose logs --tail 50 <container_name>` で原因を確認。

### 2. サービス直接ヘルスチェック

```bash
for p in 3001 3002 3003 3004 3005 3006; do
  echo "== :$p =="; curl -sf http://localhost:$p/health || echo "FAIL"
done
curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:3000   # frontend
```

### 3. Kong Gateway 経由（プラグイン検証）

```bash
# 認証不要ルート（proxy-cache 有効。X-Cache-Status ヘッダを確認）
curl -s -D - -o /dev/null http://localhost:8000/api/products | grep -iE 'HTTP|X-Cache'
# key-auth ルート: キーなし → 401 が正常
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/orders
# key-auth ルート: demo キー → 200
curl -s -o /dev/null -w '%{http_code}\n' -H 'apikey: demo-api-key' http://localhost:8000/api/orders
```

### 4. 非同期フロー（Kafka + Event Gateway）

Order → Kafka → Shipping の疎通は、注文作成後に shipment が生成されるかで確認:

```bash
curl -s -X POST http://localhost:8000/api/orders -H 'apikey: demo-api-key' -H 'Content-Type: application/json' -d '{...}'  # 注文作成（body は order-api.md 参照）
sleep 3
curl -s -H 'apikey: demo-api-key' http://localhost:8000/api/shipments   # 対応する shipment があるか
```

### 5. オブザーバビリティ

```bash
curl -sf -o /dev/null -w 'grafana: %{http_code}\n' http://localhost:3010
```

トレースが届いているかは Grafana (:3010) の Tempo データソースで確認するようユーザーに案内する。

## 判定基準

- 手順 2 で FAIL → そのサービスのログを見て根本原因を報告（再起動で握りつぶさない）
- 手順 3 で 401 が出ない → kong.yaml の key-auth 設定が消えている可能性
- レート制限テスト: `/api/orders` へ 11 回連続リクエストで 429 が返れば rate-limiting 動作中
