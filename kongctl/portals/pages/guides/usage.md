---
title: "API Usage Guide"
description: "API利用ガイド - ベストプラクティスとパターン"
page-layout:
  sidebar-left: sidebar
---

::page-section
---
full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
---

# ⚡ API利用ガイド

Jungle Store APIを効果的に活用するためのベストプラクティス、パターン、ヒントを紹介します。

---

## 🔐 認証

### API Keyの管理

::alert
---
type: "warning"
---
**セキュリティ第一:** API Keyは絶対に公開しないでください。
::

#### 環境変数の使用

**✅ 推奨:**

```bash
# .env ファイル
API_KEY=your_api_key_here
API_BASE_URL=http://localhost:8000
```

```javascript
// アプリケーションコード
const apiKey = process.env.API_KEY;
```

**❌ 非推奨:**

```javascript
// コードに直接記述しない
const apiKey = "demo-api-key";
```

### 認証ヘッダー

Jungle Store APIでは2つのヘッダーが必要です：

```bash
# API Key認証（Cart, Order, Shipping API）
curl http://localhost:8000/api/carts \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

> **注意:** Catalog API と User API は認証不要です。

---

## 🚀 リクエストのベストプラクティス

### HTTPメソッドの使い分け

| メソッド | 用途 | 例 |
|---------|------|-----|
| **GET** | データの取得 | 商品一覧、注文詳細 |
| **POST** | 新規リソースの作成 | カートに追加、注文作成 |
| **DELETE** | リソースの削除 | カートからアイテム削除 |

### ヘッダーの設定

**必須ヘッダー（認証が必要なAPI）:**

```http
apikey: your_api_key
X-User-Id: your_user_id
Content-Type: application/json
```

**Kong が自動付与するヘッダー:**

```http
X-Request-Id: unique-correlation-id
X-Cache-Status: Miss|Hit (Catalog APIのみ)
```

---

## 🔍 フィルタリング

### カテゴリ絞り込み（Catalog API）

```bash
# カテゴリで絞り込み
curl "http://localhost:8000/api/products?category=バナナ"

# 全商品取得
curl http://localhost:8000/api/products
```

利用可能なカテゴリ: バナナ、ファッション、フィットネス、アウトドア、書籍、エンタメ

---

## ⚡ パフォーマンス最適化

### 1. プロキシキャッシュの活用

Catalog APIにはKong Proxy Cacheプラグインが設定されています（TTL: 30秒）：

```bash
# 初回リクエスト → X-Cache-Status: Miss
curl -i http://localhost:8000/api/products

# 2回目（30秒以内）→ X-Cache-Status: Hit
curl -i http://localhost:8000/api/products
```

### 2. 並行リクエスト

JavaScriptの例：

```javascript
// 並行実行
const [products, cart, orders] = await Promise.all([
  fetch('/api/products').then(r => r.json()),
  fetch('/api/carts', {
    headers: { 'apikey': API_KEY, 'X-User-Id': USER_ID }
  }).then(r => r.json()),
  fetch('/api/orders', {
    headers: { 'apikey': API_KEY, 'X-User-Id': USER_ID }
  }).then(r => r.json())
]);
```

---

## 🔒 レート制限

### 制限値

| スコープ | リクエスト/分 | 対象 |
|----------|-------------|------|
| グローバル | 60 | 全API |
| Order API | 10 | 注文関連のみ |

### レスポンスヘッダー

```http
RateLimit-Limit: 60
RateLimit-Remaining: 59
RateLimit-Reset: 58
```

### レート制限のハンドリング

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 60;
      console.log(`Rate limited. Waiting ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return response.json();
  }

  throw new Error('Max retries exceeded');
}
```

---

## 🛠️ エラーハンドリング

### HTTPステータスコード

**2xx Success**

- **200 OK**: リクエスト成功
- **201 Created**: リソース作成成功
- **204 No Content**: 成功、レスポンスボディなし

**4xx Client Error**

- **400 Bad Request**: 不正なリクエスト
- **401 Unauthorized**: API Key未設定またはX-User-Id未設定
- **404 Not Found**: リソースが存在しない
- **429 Too Many Requests**: レート制限

**5xx Server Error**

- **500 Internal Server Error**: サーバー内部エラー
- **503 Service Unavailable**: サービス利用不可

### エラーハンドリングの実装

```javascript
async function handleApiRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'apikey': process.env.API_KEY,
        'X-User-Id': process.env.USER_ID,
        'Content-Type': 'application/json',
        ...options.headers,
      }
    });

    if (!response.ok) {
      switch (response.status) {
        case 401:
          throw new Error('Unauthorized: Check apikey and X-User-Id headers');
        case 404:
          throw new Error('Not Found');
        case 429:
          throw new Error('Rate limit exceeded');
        default:
          throw new Error(`Error ${response.status}`);
      }
    }

    return response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}
```

---

## 💡 実践的なパターン

### リトライロジック（エクスポネンシャルバックオフ）

```javascript
async function fetchWithExponentialBackoff(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return response.json();
      }

      // 5xxエラーの場合のみリトライ
      if (response.status >= 500) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s...
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // 4xxエラーはリトライしない
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
}
```

---

::snippet
---
name: "footer-support"
---
::

::
