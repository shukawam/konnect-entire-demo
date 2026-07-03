#!/bin/bash
# PostToolUse hook (Edit|Write): Prettier 自動整形 + バックエンドサービスのスコープ付き型チェック
input=$(cat)
file_path=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).tool_input.file_path||'')}catch{console.log('')}})" 2>/dev/null)
[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -d node_modules ] || exit 0

# lint-staged と同じ対象拡張子を Prettier で整形（pre-commit 前にフォーマット差分を潰す）
case "$file_path" in
  *.js | *.jsx | *.ts | *.tsx | *.json | *.css | *.md | *.yaml | *.yml)
    npx --no-install prettier --write "$file_path" >/dev/null 2>&1 || true
    ;;
esac

# バックエンドサービス / packages の .ts はサービス単位で型チェック（frontend は next build が担当）
case "$file_path" in
  */services/frontend/*) exit 0 ;;
  *.ts)
    dir=$(dirname "$file_path")
    while [ "$dir" != "/" ] && [ ! -f "$dir/tsconfig.json" ]; do
      dir=$(dirname "$dir")
    done
    case "$dir" in
      */services/* | */packages/*)
        errors=$(npx --no-install tsc --noEmit -p "$dir" 2>&1)
        rc=$?
        if [ $rc -ne 0 ] && [ -n "$errors" ]; then
          echo "TypeScript errors in $dir:" >&2
          echo "$errors" | head -30 >&2
          exit 2
        fi
        ;;
    esac
    ;;
esac

exit 0
