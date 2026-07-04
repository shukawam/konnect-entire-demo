#!/usr/bin/env bash
# kongctl/ を接頭辞付きでレンダリングし、同期ソースのパスを stdout に出力する。
# RESOURCE_PREFIX が空なら kongctl/ をそのまま出力（コピーなし）。
# 診断出力は stderr のみ（stdout はパス 1 行に限定）。
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

prefix="${RESOURCE_PREFIX:-}"
src="$REPO_ROOT/kongctl"

if [ -z "$prefix" ]; then
  printf '%s\n' "$src"
  exit 0
fi

out="$REPO_ROOT/.tmp/kongctl-render"
rm -rf "$out"; mkdir -p "$(dirname "$out")"
cp -R "$src" "$out"

# namespace を全ファイルで差し替え
for f in "$out"/*.yaml; do
  P="jungle-store-$prefix" yq -i '(._defaults.kongctl.namespace) |= strenv(P)' "$f"
done
# Konnect 可視名を接頭辞化（ref は不変）
S="-$prefix" yq -i '(.control_planes[].name) |= . + strenv(S)' "$out/control-planes.yaml"
S="-$prefix" yq -i '(.event_gateways[].name) |= . + strenv(S)' "$out/event-gateways.yaml"
S="-$prefix" yq -i '(.portals[].name) |= . + strenv(S)' "$out/portals.yaml"
# API 名は OpenAPI info.title 由来 → コピーした spec の title を接頭辞化
for spec in "$out"/portals/apis/*/openapi.yaml; do
  S="-$prefix" yq -i '(.info.title) |= . + strenv(S)' "$spec"
done

printf '%s\n' "$out"
