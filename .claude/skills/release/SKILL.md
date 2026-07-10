---
name: release
description: Use when the user wants to cut a GitHub Release for this repo — 「リリースして」「vX.Y.Zでリリース」「1.0.0としてリリース」等。バージョン番号を指定してタグ + GitHub Release を作成する。
---

# GitHub リリース作成フロー

`main` の現時点のコミットに対して Git タグ + GitHub Release を作成する手順。`gh release create` は内部でタグ作成 + push を行うため、`git tag` / `git push --tags` を個別に叩く必要はない（このリポジトリの worktree では `git commit` / `git push` がフックで誤ブロックされることがあるが、`gh` コマンドはその対象外）。

## 手順

1. **バージョン確認**: ユーザーの発言からバージョン番号（SemVer, 例: `1.0.0`）を取得する。明示されていなければ確認する。タグ名はリポジトリの慣習に合わせ `v` プレフィックスを付ける（例: `1.0.0` → タグ `v1.0.0`）。

2. **重複チェック**: 同名タグ/リリースが既に存在しないか確認する。

   ```bash
   gh release view vX.Y.Z 2>&1
   ```

   既に存在する場合はユーザーに確認する（上書き・別バージョン番号への変更など）。

3. **リリース対象ブランチの健全性確認**: 通常は `main`。直近の CI が成功していることを確認する。

   ```bash
   gh run list --branch main --limit 1
   ```

   `failure` の場合はユーザーに知らせ、リリースを続行してよいか確認する（CI失敗を承知の上でのリリースは非推奨）。

4. **リリース作成**: `--generate-notes` で直近リリース以降（初回は履歴全体）にマージされた PR からリリースノートを自動生成する。

   ```bash
   gh release create vX.Y.Z --target main --title "vX.Y.Z" --generate-notes
   ```

5. リリース URL をユーザーに報告する。

## スコープ外

- このスキルは GitHub Release の作成のみを行う。npm パッケージの publish、Docker イメージのビルド/push、Konnect への反映（`/sync-konnect`）等は別途必要であれば個別に実施する（本リポジトリはデモ用アプリケーションで npm publish 等は行わない）。
- `main` 以外のブランチ・コミットを対象にしたい場合は `--target <branch-or-sha>` を明示する。

## よくある間違い

- タグ名の `v` プレフィックスを付け忘れる／ユーザー指定と食い違う → 手順1で確認する
- CI が失敗した状態のコミットに気づかずリリースしてしまう → 手順3を必ず実施する
- 既存タグと衝突して `gh release create` がエラーになる → 手順2で事前チェック
