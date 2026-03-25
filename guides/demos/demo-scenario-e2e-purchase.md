# シナリオ 2: EC サイト購買フロー（エンドツーエンド）

ブラウザで商品閲覧からカート追加、注文確定、配送ステータス自動更新までの一連のフローを体験するデモです。マイクロサービスと Kafka によるイベント駆動の仕組みを実際の購買体験を通じて確認します。

**対象:** ビジネスサイド、マイクロサービスの実用例を見たい方
**所要時間:** 10〜15分

---

## 前提

- 全サービスが起動済み（`docker compose up -d --build`）
- ブラウザで http://localhost:3000 にアクセス可能

---

## ステップ 1: ログイン

1. http://localhost:3000 にアクセス
2. 右上の「ログイン」をクリック
3. 以下の情報でログイン:
   - メール: `user@example.com`
   - パスワード: `password123`
4. ログイン成功後、商品一覧ページにリダイレクトされる

---

## ステップ 2: 商品閲覧

1. トップページに 12 商品のグリッドが表示される
2. カテゴリフィルタボタンで絞り込みを試す:
   - 「バナナ」「ファッション」「フィットネス」など
3. 各商品の名前・価格・画像を確認

### 解説ポイント

- フロントエンド（Next.js）→ Kong Gateway → Catalog Service の流れでデータを取得
- Kong の `proxy-cache` プラグインにより、GET リクエストは 30 秒間キャッシュされる

---

## ステップ 3: カートに商品を追加

1. 好きな商品の「カートに追加」ボタンをクリック
2. トースト通知で追加完了を確認
3. ナビゲーションバーのカートアイコンにバッジ（商品数）が表示される
4. 2〜3 商品をカートに追加する

### 解説ポイント

- Cart Service は `key-auth` プラグインで保護されている
- フロントエンドが API キーを `apikey` ヘッダーに自動付与している

---

## ステップ 4: カートの確認と調整

1. ナビゲーションバーの「カート」をクリック
2. カートページで以下を確認:
   - 追加した商品の一覧
   - 各商品の数量（+/- ボタンで変更可能）
   - 小計と合計金額
3. 数量を変更して合計金額が更新されることを確認

---

## ステップ 5: 注文確定

1. カートページ下部の「注文する」ボタンをクリック
2. 注文が確定し、注文履歴ページにリダイレクトされる

### 裏側の処理フロー

注文確定ボタンを押した瞬間に以下が発生します:

```sh
[フロントエンド]
    │ POST /api/orders
    v
[Kong Gateway] ── key-auth 認証 + rate-limiting チェック
    │
    v
[Order Service]
    ├── 注文レコード作成（MySQL）、ステータス: PENDING
    ├── カートの中身をクリア
    └── order.created イベントを Kafka に発行
                │
                v
        [Kong Event Gateway] ── ACL 制御
                │
                v
            [Kafka]
                │
                v
        [Kong Event Gateway] ── ACL 制御
                │
                v
        [Shipping Service]
            ├── 配送レコード作成（トラッキング番号自動生成）
            ├── order.status-updated (CONFIRMED) を発行
            └── 5秒後に order.status-updated (SHIPPED) を発行
                        │
                        v
                    [Kafka]
                        │
                        v
                [Order Service]
                    └── 注文ステータスを更新
```

---

## ステップ 6: 注文ステータスの自動遷移を確認

1. 注文履歴ページで注文のステータスバッジを確認
2. 以下の順序でステータスが自動的に変化する:

| タイミング    | ステータス  | 説明                                      |
| ------------- | ----------- | ----------------------------------------- |
| 注文直後      | `PENDING`   | 注文受付完了                              |
| 数秒後        | `CONFIRMED` | Shipping Service が受信し配送レコード作成 |
| さらに約5秒後 | `SHIPPED`   | 発送シミュレーション完了                  |

3. ページをリロードして最新ステータスを確認
4. 注文をクリックして詳細ページを開く:
   - 注文した商品の一覧と金額
   - トラッキング番号（`TRK-XXXXXXXX` 形式）
   - 配送ステータスと日時

### 解説ポイント

- ステータス遷移はすべて Kafka イベント経由の非同期処理
- サービス間は直接通信せず、イベント経由で疎結合
- Kong Event Gateway がサービスごとのトピック ACL を強制

---

## ステップ 7:（オプション）curl で API を直接操作

ブラウザの裏側で何が起きているか、curl で同じフローを再現できます。

```bash
# 1. 商品一覧を取得
curl -s http://localhost:8000/api/products/ | jq '.products[:3]'

# 2. カートに商品を追加
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" \
  -d '{"productId":"prod-001","quantity":2,"price":1980}'

# 3. カートの中身を確認
curl -s http://localhost:8000/api/carts \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" | jq

# 4. 注文を確定
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"

# 5. 注文一覧を確認（数秒待ってからステータス変化を確認）
sleep 10
curl -s http://localhost:8000/api/orders \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" | jq '.[0].status'
```

---

## まとめ

このシナリオで体験した内容:

| 要素               | 技術                                          |
| ------------------ | --------------------------------------------- |
| 商品閲覧           | Kong Proxy Cache による高速レスポンス         |
| 認証               | Kong Key-Auth による API キー認証             |
| 注文制限           | Kong Rate Limiting（10 回/分）                |
| 非同期処理         | Kafka + Kong Event Gateway によるイベント駆動 |
| 自動ステータス遷移 | マイクロサービス間のイベント連携              |

1つの購買フローの中に Kong Gateway の複数の機能が統合されていることが確認できます。
