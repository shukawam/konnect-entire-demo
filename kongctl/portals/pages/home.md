---
title: 'Jungle Store Dev Portal'
description: 'Developer portal for Jungle Store.'
page-layout:
  sidebar-left: sidebar
---

## ::page-hero

title-color: "var(--kui-color-text-inverse)"
description-color: "rgba(255, 255, 255, 0.9)"
background: "linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)"
border-radius: "24px"
padding: "clamp(40px, 6vw, 80px) clamp(30px, 5vw, 60px)"
text-align: "center"
vertical-align: "center"
title-tag: "h1"
title-font-size: "clamp(42px, 5.5vw, 64px)"
title-line-height: "clamp(50px, 6vw, 76px)"
title-font-weight: "800"
description-font-size: "clamp(18px, 2.5vw, 24px)"
description-line-height: "clamp(28px, 3vw, 36px)"
description-font-weight: "400"
margin: "0 0 var(--kui-space-80) 0"
styles: |
.page-hero {
box-shadow: 0 20px 60px rgba(46, 125, 50, 0.3);
}

---

#title
🦍 Jungle Store Dev Portal 🦍

#description
ゴリラのように強いAPIプラットフォーム。<br>
APIの検索、テスト、統合を一箇所で管理します。<br>
開発者の体験を最大化します。

#actions
:::button

---

appearance: "primary"
size: "large"
to: "/guides/getting-started"

---

始める
:::

:::button

---

appearance: "primary"
size: "large"
to: "/apis"

---

APIを探す
:::

::

## ::page-section

full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"

---

## 🎯 主な機能

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--kui-space-70); margin-top: var(--kui-space-60);">

## ::card

## title: "📚 APIカタログ"

利用可能なすべてのAPIを一箇所で検索・閲覧できます。詳細なドキュメントと共に提供されます。

[APIを探す →](/apis)
::

## ::card

## title: "⚡ 高速な統合"

OpenAPI仕様に基づいた明確なドキュメントで、迅速な開発とスムーズな統合を実現します。

[Getting Started →](/guides/getting-started)
::

## ::card

## title: "🔐 セキュアな認証"

API Key認証による安全なアクセス制御。Kong Gatewayのプラグインで保護されています。

[ガイドを見る →](/guides/getting-started)
::

</div>

::

## ::page-section

full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
background: "var(--kui-color-background-neutral-weakest)"

---

## 🌟 提供中のAPI

現在利用可能な主要APIサービス

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--kui-space-70); margin-top: var(--kui-space-60);">

## ::card

## title: "🛍️ Catalog API"

商品カタログの管理と検索機能を提供します。商品情報の取得、カテゴリ絞り込み、在庫確認が可能です。

**バージョン:** v1.0.0
**認証:** 不要（プロキシキャッシュ有効）

[詳細を見る →](/apis)
::

## ::card

## title: "🛒 Cart API"

ショッピングカート機能を提供します。カートアイテムの追加、更新、削除などの操作が可能です。

**バージョン:** v1.0.0
**認証:** API Key必須

[詳細を見る →](/apis)
::

## ::card

## title: "📦 Order API"

注文処理と管理機能を提供します。注文の作成、ステータス確認、履歴閲覧が可能です。Kafka非同期処理対応。

**バージョン:** v1.0.0
**認証:** API Key必須（レート制限: 10回/分）

[詳細を見る →](/apis)
::

## ::card

## title: "🚚 Shipping API"

配送追跡機能を提供します。注文IDから配送ステータスを確認できます。

**バージョン:** v1.0.0
**認証:** API Key必須

[詳細を見る →](/apis)
::

## ::card

## title: "👤 User API"

ユーザー登録・ログイン機能を提供します。API Keyの自動生成に対応しています。

**バージョン:** v1.0.0
**認証:** 不要

[詳細を見る →](/apis)
::

## ::card

## title: "🤖 Agent API"

AI搭載のショッピングアシスタント。自然言語で商品検索や注文サポートを行います。

**バージョン:** v0.1.0
**Tier:** Premium

[詳細を見る →](/apis)
::

</div>

::

## ::page-section

full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"

---

## 🚦 クイックスタート

## ::alert

appearance: "info"
show-icon:
message: "はじめての方へ: APIを使い始めるには、まずユーザー登録を行い、API Keyを取得してください。"

---

::

### 3ステップで始める

1. **ユーザー登録**
   User API の `/api/users/register` でアカウントを作成します。API Keyが自動発行されます。

2. **API Keyをヘッダーに設定**
   `apikey: your-api-key` と `X-User-Id: your-user-id` をリクエストヘッダーに追加します。

3. **APIを呼び出す**
   ドキュメントを参照して、最初のAPIリクエストを送信します。

## ::button

appearance: "primary"
size: medium
display: "inline-flex"
to: /guides/getting-started
href: "/guides/getting-started"

---

詳細なガイドを見る →
::

::

## ::page-section

full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
background: "var(--kui-color-background-neutral-weakest)"

---

## 💡 サポートとリソース

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--kui-space-70); margin-top: var(--kui-space-60);">

## ::card

## title: "📖 ドキュメント"

各APIの詳細な仕様、サンプルコード、ベストプラクティスを提供しています。

[ドキュメントを見る →](/guides/getting-started)
::

## ::card

## title: "🔄 APIライフサイクル"

API開発のライフサイクル、バージョニング、廃止ポリシーについて説明します。

[ライフサイクルガイド →](/guides/lifecycle)
::

</div>

::

## ::page-section

full-width: false
padding: "var(--kui-space-60) var(--kui-space-50)"

---

## ::snippet

## name: "footer-support"

::

::
