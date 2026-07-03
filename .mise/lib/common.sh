#!/usr/bin/env bash
# 共通ヘルパ。各タスクスクリプトから source する。
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# env_get KEY [FILE] → 値を stdout（無ければ空）
env_get() {
  local key="$1" file="${2:-$ENV_FILE}"
  [ -f "$file" ] || return 0
  awk -F= -v k="$key" '$1==k { sub(/^[^=]*=/,""); print; exit }' "$file"
}

# env_set KEY VALUE [FILE] → ^KEY= 行を置換、無ければ追記
env_set() {
  local key="$1" val="$2" file="${3:-$ENV_FILE}"
  [ -f "$file" ] || die ".env が見つかりません: $file"
  local tmp; tmp="$(mktemp)"
  KEY="$key" VAL="$val" awk '
    BEGIN { key=ENVIRON["KEY"]; val=ENVIRON["VAL"]; found=0 }
    $0 ~ "^" key "=" { print key "=" val; found=1; next }
    { print }
    END { if (!found) print key "=" val }
  ' "$file" >"$tmp"
  mv "$tmp" "$file"
}

# Konnect PAT を deck / kongctl の双方へ供給する。
# .env の DECK_KONNECT_TOKEN を単一の source of truth とし、
# deck は環境変数 DECK_KONNECT_TOKEN（--konnect-token 相当）を、
# kongctl は KONGCTL_DEFAULT_KONNECT_PAT（konnect.pat 相当）を読む。
setup_konnect_pat() {
  local tok; tok="$(env_get DECK_KONNECT_TOKEN)"
  case "$tok" in
    ""|"<your-konnect-pat>") die "DECK_KONNECT_TOKEN が .env に未設定です（有効な Konnect PAT を設定してください）" ;;
  esac
  export DECK_KONNECT_TOKEN="$tok"
  export KONGCTL_DEFAULT_KONNECT_PAT="$tok"
}
