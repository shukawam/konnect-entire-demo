#!/bin/bash
# PostToolUse hook (Edit|Write): Prettier 自動整形 + バックエンドサービスのスコープ付き型チェック
input=$(cat)
. "$(dirname "$0")/lib.sh"
file_path=$(get_tool_input_field "$input" "file_path")
[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
BIN="$PWD/node_modules/.bin"
[ -d "$BIN" ] || exit 0

# lint-staged と同じ対象拡張子（package.json の lint-staged glob が正）を Prettier で整形
case "$file_path" in
  *.js | *.jsx | *.ts | *.tsx | *.json | *.css | *.md | *.yaml | *.yml)
    [ -x "$BIN/prettier" ] && "$BIN/prettier" --write "$file_path" >/dev/null 2>&1
    ;;
esac

# バックエンドサービス / packages の .ts はサービス単位で型チェック。
# frontend は next build が担当。テストファイルは各サービスの tsconfig で exclude
# されておりチェック対象外のためスキップ（vitest 実行時に検証される）。
case "$file_path" in
  */services/frontend/* | */__tests__/* | *.test.ts) exit 0 ;;
  *.ts)
    dir=$(dirname "$file_path")
    while [ "$dir" != "/" ] && [ ! -f "$dir/tsconfig.json" ]; do
      dir=$(dirname "$dir")
    done
    case "$dir" in
      */services/* | */packages/*)
        [ -x "$BIN/tsc" ] || exit 0
        errors=$("$BIN/tsc" --noEmit -p "$dir" 2>&1)
        rc=$?
        if [ $rc -ne 0 ] && [ -n "$errors" ]; then
          total=$(printf '%s\n' "$errors" | grep -c 'error TS')
          lines=$(printf '%s\n' "$errors" | wc -l | tr -d ' ')
          echo "TypeScript errors in $dir (error count: $total):" >&2
          printf '%s\n' "$errors" | head -50 >&2
          [ "$lines" -gt 50 ] && echo "... ($((lines - 50)) more lines truncated; run '$BIN/tsc --noEmit -p $dir' for full output)" >&2
          exit 2
        fi
        ;;
    esac
    ;;
esac

exit 0
