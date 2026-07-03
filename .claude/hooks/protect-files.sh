#!/bin/bash
# PreToolUse hook (Edit|Write): 機密・生成物ファイルへの書き込みをブロックする
input=$(cat)
file_path=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).tool_input.file_path||'')}catch{console.log('')}})" 2>/dev/null)
[ -z "$file_path" ] && exit 0

deny() {
  echo "$1" >&2
  exit 2
}

base=$(basename "$file_path")

case "$base" in
  .env | .env.local | .env.*.local)
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
  */certs/* | certs/*)
    deny "BLOCKED: certs/ 配下の証明書・秘密鍵は編集禁止です。"
    ;;
esac

exit 0
