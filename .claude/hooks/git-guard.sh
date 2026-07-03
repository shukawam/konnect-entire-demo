#!/bin/bash
# PreToolUse hook (Bash): main ブランチへの直接コミット・強制 push をブロックする
input=$(cat)
command=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).tool_input.command||'')}catch{console.log('')}})" 2>/dev/null)
[ -z "$command" ] && exit 0

deny() {
  echo "$1" >&2
  exit 2
}

if echo "$command" | grep -qE 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit'; then
  branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$branch" = "main" ]; then
    deny "BLOCKED: main ブランチへの直接コミットは禁止です（CLAUDE.md 規約）。先に feature/xxx または bugfix/xxx ブランチを作成してください。"
  fi
fi

if echo "$command" | grep -qE 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push.*[[:space:]](--force|--force-with-lease)([[:space:]]|$)'; then
  deny "BLOCKED: 強制 push は禁止です。必要な場合はユーザーに確認してください。"
fi

if echo "$command" | grep -qE 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]+[^[:space:]]+)?[[:space:]]+main([[:space:]]|$)'; then
  deny "BLOCKED: main ブランチへの直接 push は禁止です。PR を作成してマージしてください。"
fi

exit 0
