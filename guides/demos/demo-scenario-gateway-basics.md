# シナリオ 1: API Gateway の基本機能

Kong Gateway の主要プラグイン（プロキシキャッシュ、レート制限、API キー認証、Correlation ID）を curl で体験するデモです。

**対象:** Kong Gateway を初めて触る方
**所要時間:** 15〜20分

---

## 前提

- 全サービスが起動済み（`docker compose up -d --build`）
- ターミナルから curl が実行可能

---

## ステップ 1: プロキシキャッシュ

Catalog Service（商品一覧 API）は GET リクエストに対して 30 秒間のプロキシキャッシュが有効です。

### 1-1. 初回リクエスト（キャッシュ Miss）

```bash
curl -i http://localhost:8000/api/products/
```

レスポンスヘッダーを確認:

```sh
X-Cache-Status: Miss
```

### 1-2. 2回目のリクエスト（キャッシュ Hit）

```bash
curl -i http://localhost:8000/api/products/
```

レスポンスヘッダーを確認:

```sh
X-Cache-Status: Hit
```

### 解説ポイント

- バックエンドサービスに到達せず、Kong Gateway がキャッシュからレスポンスを返している
- レスポンス時間が大幅に短縮される（`X-Cache-Status: Hit` 時）
- キャッシュ TTL は 30 秒。30 秒経過後は再び `Miss` になる
- `application/json` の `200` レスポンスのみキャッシュ対象

---

## ステップ 2: API キー認証（Key-Auth）

Cart / Order / Shipping Service には API キー認証が設定されています。

### 2-1. API キーなしでアクセス（401 Unauthorized）

```bash
curl -i http://localhost:8000/api/carts
```

レスポンス:

```sh
HTTP/1.1 401 Unauthorized
```

### 2-2. API キー付きでアクセス（200 OK）

```bash
curl -i http://localhost:8000/api/carts \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

レスポンス:

```sh
HTTP/1.1 200 OK
```

### 解説ポイント

- Kong Gateway がバックエンドに到達する前に認証を実施
- バックエンドサービスは認証ロジックを持つ必要がない
- `apikey` ヘッダーで API キーを送信（ヘッダー名はプラグイン設定で変更可能）

---

## ステップ 3: レート制限

Order Service には 10 リクエスト/分の厳しいレート制限が設定されています。

### 3-1. 連続リクエストで制限を発動させる

```bash
for i in $(seq 1 15); do
  echo -n "Request $i: "
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:8000/api/orders \
    -H "Content-Type: application/json" \
    -H "apikey: demo-api-key" \
    -H "X-User-Id: user-001"
  echo ""
done
```

期待される出力（10回成功後に 429 が返る）:

```sh
Request 1: 200
Request 2: 200
...
Request 10: 200
Request 11: 429
Request 12: 429
...
```

> **注意:** カートに商品が入っていない場合は `400` が返りますが、レート制限の動作確認には影響しません。10回目以降に `429` に変わることがポイントです。

### 3-2. レート制限ヘッダーの確認

```bash
curl -i -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

レスポンスヘッダーを確認:

```sh
RateLimit-Limit: 10
RateLimit-Remaining: 9
RateLimit-Reset: 52
```

### 解説ポイント

- グローバルには 60 リクエスト/分、Order Service には追加で 10 リクエスト/分の制限
- サービスごとに異なるレート制限ポリシーを適用可能
- `RateLimit-*` ヘッダーでクライアントが残りリクエスト数を把握できる
- バックエンドサービスの過負荷防止に効果的

---

## ステップ 4: Correlation ID

すべてのリクエストに自動的に一意の ID が付与されます。

### 4-1. Correlation ID の確認

```bash
curl -i http://localhost:8000/api/products/ 2>&1 | grep -i x-request-id
```

出力例:

```
X-Request-Id: 7f3c8a2e-1d45-4b9f-a123-456789abcdef#1
```

### 4-2. 複数リクエストで異なる ID を確認

```bash
for i in $(seq 1 3); do
  echo -n "Request $i: "
  curl -s -D - http://localhost:8000/api/products/ -o /dev/null 2>&1 | grep -i x-request-id
done
```

### 解説ポイント

- 各リクエストに UUID ベースのユニーク ID が自動付与される
- 障害調査時にリクエストを一意に特定できる
- ログ・トレースとの紐付けが可能になる
- クライアントが自分で `X-Request-Id` を指定した場合はそれが使われる

---

## ステップ 5: CORS

ブラウザからのクロスオリジンリクエストが正しく制御されていることを確認します。

### 5-1. プリフライトリクエストのシミュレーション

```bash
curl -i -X OPTIONS http://localhost:8000/api/products/ \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET"
```

レスポンスヘッダーを確認:

```sh
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

### 解説ポイント

- `http://localhost:3000`（フロントエンド）からのアクセスのみ許可
- 許可されていないオリジンからのリクエストはブロックされる
- Kong Gateway で一元管理することで、各サービスに CORS 設定を実装する必要がない

---

## まとめ

このシナリオで確認した Kong Gateway の機能:

| 機能               | プラグイン       | 効果                                   |
| ------------------ | ---------------- | -------------------------------------- |
| プロキシキャッシュ | `proxy-cache`    | バックエンド負荷軽減、レスポンス高速化 |
| API キー認証       | `key-auth`       | バックエンドの認証ロジック不要         |
| レート制限         | `rate-limiting`  | サービスごとの過負荷防止               |
| Correlation ID     | `correlation-id` | リクエスト追跡・障害調査               |
| CORS               | `cors`           | クロスオリジン制御の一元管理           |

これらはすべて Kong Gateway の宣言型設定（`kong.yaml`）で管理されており、コードの変更なしに追加・変更が可能です。
