#!/bin/bash
# PreToolUse hook (Edit|Write): 機密・生成物ファイルへの書き込みをブロックする。
# .claude/settings.json の permissions.deny (Edit ルール) が最終防衛線で、
# このフックはリポジトリ内の任意の場所にある同名ファイルもカバーする追加層。
input=$(cat)
. "$(dirname "$0")/lib.sh"
file_path=$(get_tool_input_field "$input" "file_path")
[ -z "$file_path" ] && exit 0

deny() {
  echo "$1" >&2
  exit 2
}

case "$(basename "$file_path")" in
  .env.example) ;; # テンプレートは編集可
  .env | .env.*)
    deny "BLOCKED: $file_path は機密ファイルです。変更が必要な場合は .env.example を更新し、ユーザーに手動反映を依頼してください。"
    ;;
  package-lock.json)
    deny "BLOCKED: package-lock.json は直接編集禁止です。npm install 経由で更新してください。"
    ;;
  mise.toml)
    deny "BLOCKED: mise.toml には API キー等の機密情報が含まれます。ユーザーに手動編集を依頼してください。"
    ;;
esac

case "$file_path" in
  */certs/*)
    deny "BLOCKED: certs/ 配下の証明書・秘密鍵は編集禁止です。"
    ;;
esac

exit 0
