---
name: add-endpoint
description: Use when adding or modifying an API endpoint in any backend service (catalog/cart/order/shipping/user/agent) — new route, new path, request/response schema change, or when the user says「エンドポイントを追加」「APIを追加」.
---

# API エンドポイント追加

## 原則

OpenAPI 仕様は手書き禁止。`@hono/zod-openapi` の Zod スキーマから自動生成される。エンドポイント追加 = Zod スキーマ + `createRoute` + テストの 3 点セット。

## 手順

1. **既存パターンを読む**: 対象サービスの `services/<名前>-service/src/routes.ts` と `src/__tests__/routes.test.ts` を読み、スキーマ命名・エラーレスポンス形式（`ErrorSchema = z.object({ error: z.string() })`）を確認する（`<名前>` は catalog / cart / order / shipping / user / agent のいずれか。ディレクトリ名は常に `-service` サフィックス付き）。

2. **テストを先に書く**（TDD）: `src/__tests__/routes.test.ts` に追加。パターン:
   - `vi.mock('../db.js', ...)` で Prisma をモック（`import app from '../routes.js'` より**前**に書く）
   - `app.request('/path')` でリクエストし、status と body を検証
   - Prisma の Date フィールドはルート側で `toISOString()` されるため、期待値は文字列
   - 実行: `npm run test -w services/<名前>-service` → 失敗を確認

3. **ルートを実装**: `routes.ts` に Zod スキーマ（`.openapi('SchemaName')` と `example` 付き）→ `createRoute({ method, path, tags, summary, description, request, responses })` → `app.openapi(route, handler)`。日本語の summary/description を付ける。

4. **検証**:

   ```bash
   npm run test -w services/<名前>-service   # テスト
   npx tsc --noEmit -p services/<名前>-service  # 型チェック（post-edit フックでも自動実行される）
   ```

5. **Kong ルートの確認**: 新しいパスプレフィックスの場合のみ `config/kong/kong.yaml` に route 追加が必要。既存プレフィックス（`/api/products` 等）配下なら不要。kong.yaml を変更した場合、反映には `/sync-konnect`（ユーザー実行）が必要と報告する。

6. **ガイド更新**: `guides/<サービス名>-api.md` が存在する場合、新エンドポイントを追記する。

## よくある間違い

- OAS を JSON/YAML で手書きする → 禁止。Zod から自動生成のみ
- `vi.mock` を import の後に書く → モックが効かない
- `z.coerce.number()` を忘れる → クエリパラメータは文字列で届く
- Prisma スキーマ変更時に `npm run db:generate` を忘れる → 型エラー
