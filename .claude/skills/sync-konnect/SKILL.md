---
name: sync-konnect
description: Use when applying Kong/Konnect configuration changes — after editing config/kong/kong.yaml or kongctl/*.yaml, when the user says「Konnectに反映」「同期して」「デプロイして」.
disable-model-invocation: true
---

# Kong / Konnect 設定の同期

外部環境（Konnect 本番コントロールプレーン）を変更する操作。**必ず diff → ユーザー確認 → sync の順で実行する。**

## 対象の切り分け

| 変更したファイル        | diff タスク             | sync タスク                                          | 対象                             |
| ----------------------- | ----------------------- | ---------------------------------------------------- | -------------------------------- |
| `config/kong/kong.yaml` | `mise run gateway:diff` | `mise run gateway:sync`（decK）                      | Gateway の service/route/plugin  |
| `kongctl/*.yaml`        | `mise run konnect:diff` | `mise run konnect:sync`（kongctl、`--auto-approve`） | API、Portal、Event Gateway、Team |

diff タスクは読み取り専用（適用しない）。sync タスクと同じ認証・env 供給ロジック（`.mise/lib/common.sh` の `setup_konnect_pat` 等）を共有するため、素の `deck` / `kongctl` コマンドを直接叩くより確実。

## 手順（Gateway 設定: kong.yaml）

1. 変更内容の diff を確認: `mise run gateway:diff`
2. diff をユーザーに提示し、適用の承認を得る。
3. 承認後: `mise run gateway:sync`
4. 反映確認: `/verify-stack` の手順 3（Kong 経由のリクエスト）で動作検証。

## 手順（Konnect リソース: kongctl/）

1. 変更内容の diff を確認: `mise run konnect:diff`
2. diff をユーザーに提示し、適用の承認を得る。
3. 承認後: `mise run konnect:sync`（内部で `--auto-approve` を使うため、kongctl 自体の対話確認は出ない。承認は手順 2 で得ておくこと）

## 注意

- decK / kongctl の認証は `.env` の `DECK_KONNECT_TOKEN`（Konnect PAT）を共用する。mise が `.env` を読み込むため、`mise run` 経由のタスク（`gateway:sync` 等）では自動で供給される。素の shell で `deck` / `kongctl` を直接叩く場合は事前に `export DECK_KONNECT_TOKEN=... KONGCTL_DEFAULT_KONNECT_PAT=...` するか `mise exec -- ...` で実行する。認証エラー時は PAT の失効を疑い、`mise run doctor` で有効性を確認する。
- kong.yaml には OpenAI キー参照（`DECK_OPENAI_API_KEY`、mise.toml の env で注入）がある。sync は mise 経由で実行しないと環境変数が欠落する。
