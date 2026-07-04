# Makefile — mise 非依存のセットアップ入口。
#
# `mise run setup` と同等のコア導線（setup / up / down）を make で提供する。
# 各ステップの実体は .mise/tasks/* のシェルスクリプトで、mise と make の
# 双方から同じスクリプトを呼び出す（ロジックの単一 source of truth）。
# CLI ツール（deck / kongctl / jq / yq / openssl / docker）の導入は従来どおり
# 各自で行う。make はオーケストレーションのみを担い、doctor が前提を検証する。
#
# 分離起動（RESOURCE_PREFIX）と teardown も make で実行できる。RESOURCE_PREFIX を
# 付けると既存 Konnect リソースと衝突しない分離環境を作成/破棄する。個別サブタスク
# （doctor / certs:gen 等の単体実行）だけは mise 専用のまま。

TASKS := .mise/tasks
export RESOURCE_PREFIX

.DEFAULT_GOAL := help
.PHONY: help setup up down teardown

help: ## 利用可能なターゲット一覧
	@echo "使い方: make <target> [RESOURCE_PREFIX=<name>]"
	@echo ""
	@echo "  setup      doctor → certs → konnect 同期 → .env 反映 → gateway 同期 → 起動 を一括実行"
	@echo "  up         コンテナを起動（docker compose up -d --build）"
	@echo "  down       コンテナを停止（docker compose down）"
	@echo "  teardown   分離環境の後始末（RESOURCE_PREFIX 必須。Konnect リソース削除 + down -v + .env 復元）"
	@echo ""
	@echo "分離起動（既存 Konnect リソースと衝突しない e2e 用一式）:"
	@echo "  make setup RESOURCE_PREFIX=e2e"
	@echo "  make teardown RESOURCE_PREFIX=e2e"
	@echo ""
	@echo "前提: .env に DECK_KONNECT_TOKEN と DECK_OPENAI_API_KEY を記入しておくこと。"

setup: ## 1コマンドセットアップ（mise run setup 相当。RESOURCE_PREFIX で分離起動）
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

teardown: ## 分離環境の後始末（RESOURCE_PREFIX 必須）
	bash $(TASKS)/teardown
