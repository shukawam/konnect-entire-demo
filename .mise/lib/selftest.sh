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

[ "$fail" = 0 ] && echo "ALL PASS" || { echo "SELFTEST FAILED"; exit 1; }
