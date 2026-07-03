# 共有ヘルパー: hook JSON (stdin で受けた文字列) から tool_input のフィールドを抽出する
# 使い方: value=$(get_tool_input_field "$input" "file_path")
# 注意: node が見つからない場合は空文字を返す（フックはフェイルオープン）。
# 機密ファイルの最終防衛線は .claude/settings.json の permissions.deny 側にある。
get_tool_input_field() {
  echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).tool_input[process.argv[1]]||'')}catch{console.log('')}})" "$2" 2>/dev/null
}
