#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/common.sh"
fail=0
assert_eq() { [ "$1" = "$2" ] || { echo "FAIL [$3]: expected [$2] got [$1]"; fail=1; }; }

# --- env_set / env_get ---
tmp="$(mktemp)"
printf 'PREFIX=<your-konnect-endpoint-prefix>\nAUTH_URL=http://localhost:3000\n' >"$tmp"
env_set PREFIX abc123 "$tmp"
assert_eq "$(env_get PREFIX "$tmp")" "abc123" "replace"
assert_eq "$(env_get AUTH_URL "$tmp")" "http://localhost:3000" "untouched"
env_set NEW hello "$tmp"
assert_eq "$(env_get NEW "$tmp")" "hello" "append"
env_set AUTH_SECRET "a/b+c=d==" "$tmp"
assert_eq "$(env_get AUTH_SECRET "$tmp")" "a/b+c=d==" "special-chars"
rm -f "$tmp"

# --- PREFIX 抽出 jq（env:patch と同一式）---
# kongctl get gateway control-planes -o json はトップレベル配列を返す。
# .data? の ? が無いと配列を "data" で添字して jq がエラーになるため、両形状を検証する。
extract_prefix() {
  local ep
  ep="$(jq -r --arg n jungle-store-gateway '(.data? // .)|(if type=="array" then . else [.] end)|map(select(.name==$n))|.[0]|(.config.control_plane_endpoint // .config.controlPlaneEndpoint // .control_plane_endpoint // empty)')"
  printf '%s' "$ep" | sed -E 's#^https?://##; s#\..*$##'
}
# オブジェクト形 {"data":[...]}
obj='{"data":[{"name":"jungle-store-gateway","config":{"control_plane_endpoint":"https://4fa752f311.us.cp.konghq.com"}}]}'
assert_eq "$(printf '%s' "$obj" | extract_prefix)" "4fa752f311" "prefix-extract-object"
# トップレベル配列形（実 API の形）
arr='[{"name":"other","config":{}},{"name":"jungle-store-gateway","config":{"control_plane_endpoint":"https://4fa752f311.us.cp.konghq.com"}}]'
assert_eq "$(printf '%s' "$arr" | extract_prefix)" "4fa752f311" "prefix-extract-array"

# --- render: passthrough / prefix ---
out="$(RESOURCE_PREFIX= bash "$DIR/render-kongctl.sh")"
assert_eq "$out" "$REPO_ROOT/kongctl" "render-passthrough"
out="$(RESOURCE_PREFIX=selftest bash "$DIR/render-kongctl.sh")"
assert_eq "$(yq '.control_planes[0].name' "$out/control-planes.yaml")" "jungle-store-gateway-selftest" "render-cp-name"
assert_eq "$(yq '._defaults.kongctl.namespace' "$out/control-planes.yaml")" "jungle-store-selftest" "render-ns"
assert_eq "$(yq '.event_gateways[0].name' "$out/event-gateways.yaml")" "jungle-store-event-gateway-selftest" "render-eg-name"
assert_eq "$(yq '.portals[0].name' "$out/portals.yaml")" "jungle-store-dev-portal-selftest" "render-portal-name"
title="$(yq '.info.title' "$out/portals/apis/catalog/openapi.yaml")"
case "$title" in *-selftest) ;; *) echo "FAIL [render-title]: got [$title]"; fail=1 ;; esac
rm -rf "$REPO_ROOT/.tmp/kongctl-render"

[ "$fail" = 0 ] && echo "ALL PASS" || { echo "SELFTEST FAILED"; exit 1; }
