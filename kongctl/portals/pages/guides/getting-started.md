---
title: "Getting Started"
description: "Jungle Store Dev Portalの使い方ガイド"
page-layout:
  sidebar-left: sidebar
---

::page-section
---
full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
---

# 🚀 Getting Started

Jungle Store Dev Portalへようこそ！このガイドでは、APIの利用開始から実際の統合まで、ステップバイステップで説明します。

::alert
---
appearance: "success"
show-icon: true
message: "所要時間: 約15分でAPIの呼び出しまで完了できます。"
---
::

---

## 📋 前提条件

開始する前に、以下をご用意ください：

- **HTTPクライアント** - curl、httpie、Insomnia、または任意のHTTPクライアント
- **基本的な知識** - REST API、HTTP、JSONの基礎知識

---

## ステップ1: ユーザー登録

### 1.1 アカウント作成

User API を使ってアカウントを作成します：

```bash
curl -X POST http://localhost:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"新しいゴリラ","email":"new@example.com","password":"password123"}'
```

レスポンスにユーザー情報と API Key が含まれます。

### 1.2 デモユーザーでログイン

事前に用意されたデモユーザーも利用できます：

```bash
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

::alert
---
appearance: "danger"
show-icon: true
title: "重要"
message: "API Keyは安全に保管してください。決してクライアントサイドのコードやパブリックリポジトリにコミットしないでください。"
---
::

---

## ステップ2: 最初のAPIリクエスト

### 2.1 商品一覧の取得（認証不要）

最も簡単なエンドポイントから始めましょう：

```bash
curl http://localhost:8000/api/products
```

**期待されるレスポンス:**

```json
[
  {
    "id": "prod-001",
    "name": "極上キングバナナ",
    "description": "最高品質のバナナ",
    "price": 1980,
    "category": "バナナ",
    "stock": 100
  }
]
```

### 2.2 カテゴリで絞り込み

```bash
curl "http://localhost:8000/api/products?category=バナナ"
```

### 2.3 認証が必要なAPIの呼び出し

カート・注文・配送のAPIにはAPI Key認証が必要です：

```bash
# カートに商品追加
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" \
  -d '{"productId":"prod-001","quantity":2,"price":1980}'
```

### 2.4 認証の確認

HTTPステータスコードを確認：

- **200 OK**: リクエスト成功
- **401 Unauthorized**: API Keyが無効または未設定
- **429 Too Many Requests**: レート制限に到達

---

## ステップ3: 注文フロー

### 3.1 完全な注文フロー

**商品の取得 → カートに追加 → 注文作成**

```bash
# 1. 商品一覧を確認
curl http://localhost:8000/api/products

# 2. カートに商品を追加
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" \
  -d '{"productId":"prod-001","quantity":2,"price":1980}'

# 3. 注文を作成（Kafka経由で配送が自動作成されます）
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"

# 4. 注文ステータスを確認（数秒でPENDING→CONFIRMED→SHIPPEDに変化）
curl http://localhost:8000/api/orders \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

### 3.2 エラーハンドリング

```javascript
try {
  const response = await fetch(apiUrl, options);

  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error.message);
    throw new Error(error.message);
  }

  const data = await response.json();
  return data;
} catch (error) {
  console.error('Request failed:', error);
  throw error;
}
```

---

## ステップ4: ベストプラクティス

### 🔐 セキュリティ

- **環境変数を使用**: API Keyはコードに直接記述しない
- **HTTPS接続**: 本番環境では常にHTTPSを使用
- **Key Rotation**: 定期的にAPI Keyをローテーション

### ⚡ パフォーマンス

- **キャッシング**: Catalog APIはプロキシキャッシュ（30秒TTL）が有効
- **レート制限**: Order APIは10回/分、グローバルは60回/分
- **レスポンスヘッダー**: `X-Cache-Status` でキャッシュ状態を確認

### 📊 モニタリング

- **X-Request-Id**: すべてのリクエストに自動付与される相関ID
- **分散トレーシング**: Grafana (http://localhost:3010) でリクエストフローを可視化

---

## 🆘 トラブルシューティング

### よくある問題

::accordion-group
  ::accordion-panel
  #header
  401 Unauthorized エラーが発生する
  #default
  - API Keyが正しく設定されているか確認（ヘッダー名: `apikey`）
  - `X-User-Id` ヘッダーが設定されているか確認
  - デモユーザーの場合は `demo-api-key` を使用
  ::
  ::accordion-panel
  #header
  429 Too Many Requests エラーが発生する
  #default
  - Order API: 10リクエスト/分の制限
  - グローバル: 60リクエスト/分の制限
  - `X-RateLimit-Remaining` ヘッダーで残りを確認
  ::
  ::accordion-panel
  #header
  注文ステータスが変わらない
  #default
  - Kafka が正常に起動しているか確認: `docker compose logs kafka`
  - Shipping Service のログを確認: `docker compose logs shipping-service`
  - 数秒待ってから再度ステータスを確認
  ::
::

---

## 📚 次のステップ

おめでとうございます！これでAPIを使い始める準備が整いました。

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--kui-space-70); margin-top: var(--kui-space-60);">

::card
---
title: "📖 API ドキュメント"
---
各APIの詳細な仕様を確認

[ドキュメントを見る →](/apis)
::

::card
---
title: "🔄 ライフサイクル"
---
APIバージョニングと廃止ポリシー

[ガイドを見る →](/guides/lifecycle)
::

::card
---
title: "📋 利用規約"
---
利用ガイドラインとポリシー

[規約を確認 →](/guides/regulation)
::

</div>

---

::snippet
---
name: "footer-support"
---
::

::
