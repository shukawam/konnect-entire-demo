---
name: new-service
description: Use when creating a new backend microservice in this monorepo — when the user says「新しいサービスを追加」「マイクロサービスを作成」or a feature requires a new services/* workspace.
---

# 新規マイクロサービス作成

## 原則

既存サービス（`services/catalog-service` が最小構成の参照実装）を完全に踏襲する。独自構成を発明しない。

## チェックリスト

作成時は以下を TODO 化して漏れなく実施する:

1. **ポート採番**: 3001-3006 は使用済み。次の空きポート（3007〜）を使う。
2. **ディレクトリ**: `services/<名前>-service/` を作成。`catalog-service` から `package.json`（name は `@konnect-demo/<名前>-service`）、`tsconfig.json`（`tsconfig.base.json` を extends）、`Dockerfile` をコピーして調整。
3. **src 構成**（プロジェクト規約）:
   - `index.ts` — OpenAPIHono アプリ、`/health`、`app.doc('/openapi.json', ...)`、`@konnect-demo/shared` の logger/errorHandler
   - `routes.ts` — Zod スキーマ + createRoute（→ add-endpoint スキル参照）
   - `db.ts` — Prisma クライアント（DB を使う場合）
   - `kafka.ts` / `consumer.ts` — Kafka を使う場合のみ（order/shipping-service 参照）
4. **DB**: `prisma/schema.prisma` 作成 + `config/mysql/init-databases.sql` に CREATE DATABASE 追加。
5. **compose.yaml**: サービス定義を追加。**必須**: `container_name`、OTel 環境変数アンカー（`x-otel-env`）の継承、ネットワーク。既存サービスのブロックをコピーして調整。
6. **Kong**: `config/kong/kong.yaml` に service / upstream / route を追加。認証が必要なら `key-auth` プラグイン。反映は `/sync-konnect`（ユーザー実行）。
7. **ルート package.json**: `dev:<名前>` スクリプトを追加。
8. **テスト**: `src/__tests__/routes.test.ts` を必ず作成（vitest、Prisma モックパターン）。
9. **ドキュメント**: `guides/<名前>-api.md` を作成し、CLAUDE.md のポート一覧・アーキテクチャ図を更新。

## 検証

```bash
npm install                                  # workspace 登録
npx tsc --noEmit -p services/<名前>-service
npm run test -w services/<名前>-service
docker compose config -q                     # compose.yaml 構文検証
```
