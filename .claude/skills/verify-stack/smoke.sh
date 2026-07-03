#!/bin/bash
# デモスタックのスモークテスト。読み取り専用（--with-order 指定時のみ注文を 1 件作成する）。
# 使い方: bash .claude/skills/verify-stack/smoke.sh [--with-order]
set -u
ADMIN_KEY=${ADMIN_KEY:-jungle-store-demo-admin-key}
WITH_ORDER=false
[ "${1:-}" = "--with-order" ] && WITH_ORDER=true

pass=0
fail=0
ok() {
  pass=$((pass + 1))
  echo "OK : $1"
}
ng() {
  fail=$((fail + 1))
  echo "NG : $1"
}

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" 2>/dev/null; }

# 1. コンテナ状態
if command -v docker >/dev/null 2>&1; then
  bad=$(docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null | grep -vE ' running|exited \(0\)' | grep -v '^$')
  if [ -z "$bad" ]; then ok "docker compose ps: 全コンテナ running"; else ng "docker compose ps: $bad"; fi
else
  echo "SKIP: docker が見つからないためコンテナ状態は未確認"
fi

# 2. サービス直接ヘルスチェック
for p in 3001 3002 3003 3004 3005 3006; do
  c=$(code "http://localhost:$p/health")
  [ "$c" = "200" ] && ok "service :$p /health -> 200" || ng "service :$p /health -> $c"
done
c=$(code http://localhost:3000)
[ "$c" = "200" ] && ok "frontend :3000 -> 200" || ng "frontend :3000 -> $c"
c=$(code http://localhost:8081)
case "$c" in 200 | 302 | 303) ok "keycloak :8081 -> $c" ;; *) ng "keycloak :8081 -> $c" ;; esac
c=$(code http://localhost:3010)
[ "$c" = "200" ] && ok "grafana :3010 -> 200" || ng "grafana :3010 -> $c"

# 3. Kong Gateway 経由
c=$(code http://localhost:8000/api/products)
[ "$c" = "200" ] && ok "kong /api/products (認証不要) -> 200" || ng "kong /api/products -> $c"
cache=$(curl -s -D - -o /dev/null --max-time 10 http://localhost:8000/api/products 2>/dev/null | grep -i 'x-cache-status' | tr -d '\r')
[ -n "$cache" ] && ok "proxy-cache ヘッダ: $cache" || ng "proxy-cache: X-Cache-Status ヘッダなし"
c=$(code http://localhost:8000/api/orders/)
[ "$c" = "401" ] && ok "kong /api/orders/ トークンなし -> 401 (OIDC 正常)" || ng "kong /api/orders/ トークンなし -> $c (401 が期待値)"
c=$(code -H "apikey: $ADMIN_KEY" http://localhost:8000/admin/api/orders/)
[ "$c" = "200" ] && ok "kong /admin/api/orders/ (key-auth) -> 200" || ng "kong /admin/api/orders/ (key-auth) -> $c"

# 4. Kafka 非同期フロー（オプトイン: 注文を 1 件作成する）
if [ "$WITH_ORDER" = "true" ]; then
  c=$(code -X POST -H "apikey: $ADMIN_KEY" -H 'Content-Type: application/json' \
    -d '{"productId":"prod-001","quantity":1,"price":1980}' \
    http://localhost:8000/admin/api/carts/items)
  [ "$c" = "200" ] || [ "$c" = "201" ] && ok "cart 商品追加 -> $c" || ng "cart 商品追加 -> $c"
  before=$(curl -s --max-time 10 -H "apikey: $ADMIN_KEY" http://localhost:8000/admin/api/shipments/ 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
  c=$(code -X POST -H "apikey: $ADMIN_KEY" http://localhost:8000/admin/api/orders/)
  [ "$c" = "201" ] && ok "注文作成 -> 201" || ng "注文作成 -> $c (201 が期待値)"
  sleep 5
  after=$(curl -s --max-time 10 -H "apikey: $ADMIN_KEY" http://localhost:8000/admin/api/shipments/ 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
  if [ "$after" -gt "$before" ]; then
    ok "Kafka フロー: shipment が $before -> $after 件に増加"
  else
    ng "Kafka フロー: shipment 件数が増えていない ($before -> $after)。event-gateway / kafka / shipping-service のログを確認"
  fi
else
  echo "SKIP: Kafka フロー確認は --with-order 指定時のみ実行"
fi

echo "----------------------------------------"
echo "pass: $pass / fail: $fail"
[ "$fail" -eq 0 ]
