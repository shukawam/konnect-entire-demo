# Makefile — mise 非依存のセットアップ入口。
#
# `mise run setup` と同等のコア導線（setup / up / down）を make で提供する。
# 各ステップの実体は .mise/tasks/* のシェルスクリプトで、mise と make の
# 双方から同じスクリプトを呼び出す（ロジックの単一 source of truth）。
# CLI ツール（deck / kongctl / jq / yq / openssl / docker）の導入は従来どおり
# 各自で行う。make はオーケストレーションのみを担い、doctor が前提を検証する。
#
# 分離起動（RESOURCE_PREFIX）・teardown・個別サブタスクは mise 専用のまま。

TASKS := .mise/tasks
export RESOURCE_PREFIX

.DEFAULT_GOAL := help
.PHONY: help setup up down

help: ## 利用可能なターゲット一覧
	@echo "使い方: make <target>"
	@echo ""
	@echo "  setup   doctor → certs → konnect 同期 → .env 反映 → gateway 同期 → 起動 を一括実行"
	@echo "  up      コンテナを起動（docker compose up -d --build）"
	@echo "  down    コンテナを停止（docker compose down）"
	@echo ""
	@echo "前提: .env に DECK_KONNECT_TOKEN と DECK_OPENAI_API_KEY を記入しておくこと。"

setup: ## 1コマンドセットアップ（mise run setup 相当）
	bash $(TASKS)/doctor
	bash $(TASKS)/certs/gen
	bash $(TASKS)/konnect/sync
	bash $(TASKS)/env/patch
	bash $(TASKS)/gateway/sync
	bash $(TASKS)/up
	@printf '\n✅ セットアップ完了: http://localhost:3000\n'

up: ## コンテナを起動
	bash $(TASKS)/up

down: ## コンテナを停止
	bash $(TASKS)/down
