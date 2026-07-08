---
title: "デモ実施者ガイド"
description: "Kong Konnect デモシナリオ集"
page-layout:
  sidebar-left: sidebar
---

::page-section
---
full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
---

# 🎬 デモ実施者ガイド

Kong Konnect デモアプリケーションで実施可能なデモシナリオの一覧です。対象者や目的に合わせてシナリオを選択し、各詳細ガイドに沿ってデモを実施してください。

::alert
---
type: "info"
show-icon: true
message: "本ガイドは API 利用者向けではなく、社内でのデモ実施者向けの手順書です。"
---
::

::

::page-section
---
full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
background: "var(--kui-color-background-neutral-weakest)"
---

## 📖 シナリオ一覧

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--kui-space-70); margin-top: var(--kui-space-60);">

::card
---
title: "🔌 API Gateway の基本機能"
---
プロキシキャッシュ、API キー認証、レート制限、Correlation ID、CORS を curl で体験します。

**対象:** Kong Gateway 初心者 ｜ **所要時間:** 15〜20分

[ガイドを見る →](/demos/gateway-basics)
::

::card
---
title: "🛒 EC サイト購買フロー"
---
商品閲覧からカート追加、注文確定、配送ステータス自動更新までをブラウザで一気通貫に体験します。

**対象:** ビジネスサイド、マイクロサービス実用例 ｜ **所要時間:** 10〜15分

[ガイドを見る →](/demos/e2e-purchase)
::

::card
---
title: "📊 分散トレーシング & オブザーバビリティ"
---
Tempo・Loki・Prometheus・Grafana によるログ・メトリクス・トレースの統合監視を体験します。

**対象:** SRE / Platform Engineer ｜ **所要時間:** 15〜20分

[ガイドを見る →](/demos/observability)
::

::card
---
title: "🤖 AI Gateway & MCP"
---
AI Proxy、Prompt Guard、Semantic Cache、Prompt Decorator と MCP によるツール呼び出しを体験します。

**対象:** AI 活用検討者、LLM Gateway 導入検討者 ｜ **所要時間:** 15〜20分

[ガイドを見る →](/demos/ai-gateway)
::

::card
---
title: "📡 イベント駆動アーキテクチャ"
---
Kafka と Kong Event Gateway による非同期処理フローと、トピック ACL 制御を体験します。

**対象:** アーキテクト ｜ **所要時間:** 15〜20分

[ガイドを見る →](/demos/event-driven)
::

::card
---
title: "🛡️ セキュリティ多層防御"
---
認証、レート制限、CORS、AI プロンプトガード、Correlation ID による多層防御を体験します。

**対象:** セキュリティ担当 ｜ **所要時間:** 10〜15分

[ガイドを見る →](/demos/security)
::

</div>

::

::page-section
---
full-width: false
padding: "var(--kui-space-80) var(--kui-space-50)"
---

## 🧭 対象者別おすすめ組み合わせ

| 聴衆 | 推奨シナリオ | 合計時間 |
|------|------------|---------|
| 経営層・ビジネス | [EC サイト購買フロー](/demos/e2e-purchase) → [AI Gateway & MCP](/demos/ai-gateway) | 25〜35分 |
| バックエンドエンジニア | [API Gateway の基本機能](/demos/gateway-basics) → [イベント駆動アーキテクチャ](/demos/event-driven) → [オブザーバビリティ](/demos/observability) | 45〜60分 |
| Platform / SRE | [オブザーバビリティ](/demos/observability) → [API Gateway の基本機能](/demos/gateway-basics) | 30〜40分 |
| セキュリティチーム | [セキュリティ多層防御](/demos/security) → [AI Gateway & MCP](/demos/ai-gateway) | 25〜35分 |
| フルデモ | [EC サイト購買フロー](/demos/e2e-purchase) → [API Gateway の基本機能](/demos/gateway-basics) → [AI Gateway & MCP](/demos/ai-gateway) → [オブザーバビリティ](/demos/observability) | 55〜75分 |

---

## 🚀 事前準備

すべてのシナリオ共通の事前準備です。

```bash
# 全サービスを起動
docker compose up -d --build

# 全コンテナの起動を確認
docker compose ps
```

デモユーザー情報（SSO ログイン用）:

| 名前 | メール | パスワード |
|------|--------|-----------|
| Jack Driscoll | `jack@example.com` | `password` |
| Carl Denham | `carl@example.com` | `password` |

::alert
---
type: "warning"
show-icon: true
message: "本番相当の認証情報ではありません。デモ環境専用のユーザーです。"
---
::

::snippet
---
name: "footer-support"
---
::

::
