#!/bin/bash
# .claude/hooks/ のリグレッションテスト。フック変更後に必ず実行する:
#   bash .claude/hooks/run-tests.sh
set -u
HOOKS_DIR=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

# payload <field> <value...> : tool_input JSON を生成（値はトリガ文字列を含んでもよい）
payload() {
  node -e 'console.log(JSON.stringify({tool_input:{[process.argv[1]]:process.argv.slice(2).join(" ")}}))' "$@"
}

# expect <expected_exit> <hook> <payload> <label>
expect() {
  local expected=$1 hook=$2 json=$3 label=$4
  echo "$json" | CLAUDE_PROJECT_DIR="${TEST_PROJECT_DIR:-$PWD}" "$HOOKS_DIR/$hook" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq "$expected" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "NG: [$hook] $label (expected exit $expected, got $rc)" >&2
  fi
}

# ---- テスト用リポジトリ（main / feature 各ブランチ）----
make_repo() {
  local dir=$1 branch=$2
  git init -q -b main "$dir"
  git -C "$dir" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  [ "$branch" != "main" ] && git -C "$dir" checkout -q -b "$branch"
}
make_repo "$TMP/on-main" main
make_repo "$TMP/on-feature" feature/x

# ---- git-guard.sh ----
TEST_PROJECT_DIR="$TMP/on-feature"
expect 2 git-guard.sh "$(payload command git push --force origin feature/x)" "force push (long)"
expect 2 git-guard.sh "$(payload command git push -f origin feature/x)" "force push (-f)"
expect 2 git-guard.sh "$(payload command git push --force-with-lease=origin/main origin feature/x)" "force-with-lease=ref"
expect 2 git-guard.sh "$(payload command git push --force-with-lease origin feature/x)" "force-with-lease (bare)"
expect 2 git-guard.sh "$(payload command git push origin +feature/x)" "+refspec force"
expect 2 git-guard.sh "$(payload command git push origin main)" "push origin main"
expect 2 git-guard.sh "$(payload command git push -u origin main)" "push -u origin main"
expect 2 git-guard.sh "$(payload command git push origin HEAD:main)" "push HEAD:main"
expect 0 git-guard.sh "$(payload command git push -u origin feature/x)" "push feature branch"
expect 0 git-guard.sh "$(payload command git push origin main:feature/x)" "push local main to feature"
expect 0 git-guard.sh "$(payload command git commit -m 'feat: x')" "commit on feature"
expect 0 git-guard.sh "$(payload command git log --oneline -5)" "git log"
expect 0 git-guard.sh "$(payload command npm run test)" "non-git command"

TEST_PROJECT_DIR="$TMP/on-main"
expect 2 git-guard.sh "$(payload command git commit -m 'feat: x')" "commit on main"
expect 2 git-guard.sh "$(payload command git add -A '&&' git commit -m x)" "add+commit on main"
expect 0 git-guard.sh "$(payload command git checkout -b feature/y '&&' git commit -m x)" "branch-then-commit escape"
expect 0 git-guard.sh "$(payload command git switch -c feature/y '&&' git commit -m x)" "switch-then-commit escape"
expect 0 git-guard.sh "$(payload command git status)" "git status on main"

# ---- protect-files.sh ----
TEST_PROJECT_DIR="$PWD"
expect 2 protect-files.sh "$(payload file_path /repo/.env)" ".env blocked"
expect 2 protect-files.sh "$(payload file_path /repo/.env.local)" ".env.local blocked"
expect 2 protect-files.sh "$(payload file_path /repo/.env.production)" ".env.production blocked"
expect 2 protect-files.sh "$(payload file_path /repo/.env.staging)" ".env.staging blocked"
expect 2 protect-files.sh "$(payload file_path /repo/certs/cluster.key)" "certs blocked"
expect 2 protect-files.sh "$(payload file_path /repo/mise.toml)" "mise.toml blocked"
expect 2 protect-files.sh "$(payload file_path /repo/package-lock.json)" "package-lock blocked"
expect 0 protect-files.sh "$(payload file_path /repo/.env.example)" ".env.example allowed"
expect 0 protect-files.sh "$(payload file_path /repo/services/order-service/src/routes.ts)" "normal file allowed"

# ---- post-edit.sh（設定ファイルの構文バリデーション）----
TEST_PROJECT_DIR="$PWD"
printf 'key: value\n' >"$TMP/good.yaml"
printf 'key: [unclosed\n' >"$TMP/bad.yaml"
printf '{ "a": 1 }\n' >"$TMP/good.json"
printf '{ "a": 1\n' >"$TMP/bad.json" # trailing comma 等は prettier が自動修復するため、修復不能な構文エラーを使う
printf '{ /* jsonc */ "a": 1 }\n' >"$TMP/tsconfig.json"
expect 0 post-edit.sh "$(payload file_path "$TMP/good.yaml")" "valid yaml passes"
expect 2 post-edit.sh "$(payload file_path "$TMP/bad.yaml")" "invalid yaml blocks"
expect 0 post-edit.sh "$(payload file_path "$TMP/good.json")" "valid json passes"
expect 2 post-edit.sh "$(payload file_path "$TMP/bad.json")" "invalid json blocks"
expect 0 post-edit.sh "$(payload file_path "$TMP/tsconfig.json")" "tsconfig (JSONC) skips json check"
# 構文検証は node_modules（prettier/tsc）不在の環境でも動くこと
TEST_PROJECT_DIR="$TMP"
expect 2 post-edit.sh "$(payload file_path "$TMP/bad.yaml")" "validation runs without node_modules"
TEST_PROJECT_DIR="$PWD"

if command -v docker >/dev/null 2>&1; then
  mkdir -p "$TMP/good-compose" "$TMP/bad-compose"
  printf 'services:\n  web:\n    image: nginx\n' >"$TMP/good-compose/compose.yaml"
  printf 'services:\n  web:\n    imagee: nginx\n' >"$TMP/bad-compose/compose.yaml"
  expect 0 post-edit.sh "$(payload file_path "$TMP/good-compose/compose.yaml")" "valid compose passes"
  expect 2 post-edit.sh "$(payload file_path "$TMP/bad-compose/compose.yaml")" "invalid compose schema blocks"
else
  echo "SKIP: docker が無いため compose バリデーションのテストをスキップ" >&2
fi

# ---- post-edit.sh（型チェックの発火条件のみ。整形は実ファイルが必要なため対象外）----
mkdir -p "$TMP/services/bad-service/src/__tests__"
printf '{"compilerOptions":{"strict":true,"noEmit":true},"include":["src"],"exclude":["src/__tests__"]}' >"$TMP/services/bad-service/tsconfig.json"
printf 'const n: number = "x";\n' >"$TMP/services/bad-service/src/bad.ts"
printf 'const s: number = "x";\n' >"$TMP/services/bad-service/src/__tests__/bad.test.ts"
TEST_PROJECT_DIR="$PWD"
expect 2 post-edit.sh "$(payload file_path "$TMP/services/bad-service/src/bad.ts")" "type error blocks"
expect 0 post-edit.sh "$(payload file_path "$TMP/services/bad-service/src/__tests__/bad.test.ts")" "test file skips typecheck"

echo "----------------------------------------"
echo "pass: $pass / fail: $fail"
[ "$fail" -eq 0 ]
