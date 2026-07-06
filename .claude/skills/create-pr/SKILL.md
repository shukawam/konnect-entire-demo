---
name: create-pr
description: Use when implementation on a branch is complete and ready to become a pull request — when the user says「PRを作って」「プルリクを出して」, or when finishing any implementation task (CLAUDE.md requires all merges to go through a PR).
---

# PR 作成フロー

CLAUDE.md 規約「実装 → レビュー → PR」の実行手順。main への直接コミットはフックでブロックされる。

## 手順

1. **ブランチ確認**: `git branch --show-current` がセマンティックなブランチ名（`feature/xxx` / `bugfix/xxx` / `chore/xxx`）であること。main 上なら先にブランチを作成する。

2. **検証を全て通す**（変更内容に応じて選択。1 つでも失敗したら修正してからやり直す）:

   ```bash
   npm run format:check
   npx tsc --noEmit -p services/<変更したサービス>   # packages/shared を触ったら全サービス + frontend を対象にする
   npm run test -w services/<変更したサービス>       # 変更が複数サービスに及ぶ場合はルートで npm run test
   docker compose config -q                          # compose.yaml を変更した場合
   bash .claude/hooks/run-tests.sh                   # .claude/hooks/ を変更した場合
   ```

3. **コードレビュー**: `code-reviewer` サブエージェントに working diff のレビューを依頼する。Critical / Warning の指摘は妥当性を検証した上で修正し、手順 2 を再実行する（指摘の鵜呑みも無視もしない）。

4. **コミット**: セマンティックコミット規約（`feat:` / `fix:` / `chore:` / `docs:` 等）。タスクと無関係な変更を混ぜない。

5. **PR 作成**: `git push -u origin <branch>` → `gh pr create`。PR body に含めること:
   - 概要と変更点
   - **テスト結果**: 実際に実行したコマンドと結果の要約（実行していない項目は「未検証」と明記する）
   - **Konnect 反映の要否**: `config/kong/kong.yaml` または `kongctl/` を変更した場合は「マージ後に `/sync-konnect`（ユーザー実行）が必要」と明記

6. PR URL を報告する。マージはユーザーの判断（自動マージしない）。

## よくある間違い

- 検証をスキップして PR 作成 → PR body の「テスト結果」欄は実行の証拠を書く欄。書けない = 手順 2 に戻る
- kong.yaml / kongctl の変更がマージだけで反映されると誤認 → 反映は別途 `/sync-konnect` が必要
- 新しい環境変数を `.env.example` に追記し忘れる → `.env` は編集禁止のため、`.env.example` 更新 + ユーザーへの反映依頼が唯一の経路
- レビュー指摘の修正後に再検証を忘れる → 修正のたびに手順 2 に戻る
