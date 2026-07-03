#!/bin/bash
# PreToolUse hook (Bash): main ブランチへの直接コミット・強制 push をブロックする。
# これは即時フィードバック用のガードレール。実行時点での強制は .husky/pre-commit
# （main でのコミット拒否）と .husky/pre-push（main への push 拒否）が担う。
input=$(cat)

# git を含まないコマンドは node を起動せず即通過（Bash 全コールで走るため）
case "$input" in
  *git*) ;;
  *) exit 0 ;;
esac

. "$(dirname "$0")/lib.sh"
command=$(get_tool_input_field "$input" "command")
[ -z "$command" ] && exit 0

deny() {
  echo "$1" >&2
  exit 2
}

# 強制 push: -f / --force / --force-with-lease(=ref) / +refspec
if echo "$command" | grep -qE 'git[[:space:]][^|;&]*push[^|;&]*[[:space:]](-f|--force(-with-lease)?)(=|[[:space:]]|$)'; then
  deny "BLOCKED: 強制 push は禁止です。必要な場合はユーザーに確認してください。"
fi
if echo "$command" | grep -qE 'git[[:space:]][^|;&]*push[^|;&]*[[:space:]]\+[^[:space:]]'; then
  deny "BLOCKED: +refspec による強制 push は禁止です。必要な場合はユーザーに確認してください。"
fi

# main への push: `origin main`, `HEAD:main`, `refs/heads/main` いずれの形式も捕捉
if echo "$command" | grep -qE 'git[[:space:]][^|;&]*push[^|;&]*[[:space:]:/]main([[:space:]]|$)'; then
  deny "BLOCKED: main ブランチへの直接 push は禁止です。PR を作成してマージしてください。"
fi

if echo "$command" | grep -qE 'git[[:space:]][^|;&]*(commit|push)'; then
  # 同一コマンド内で先にブランチを作成/切替する場合は許可（main からの正しい離脱手順）
  if ! echo "$command" | grep -qE '(checkout[[:space:]]+-b|switch[[:space:]]+(-c|--create))'; then
    branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ "$branch" = "main" ]; then
      deny "BLOCKED: main ブランチ上での commit/push は禁止です（CLAUDE.md 規約）。先に feature/xxx または bugfix/xxx ブランチを作成してください。"
    fi
  fi
fi

exit 0
