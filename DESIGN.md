# DESIGN.md

このドキュメントは、[buildai.konghq.com](https://buildai.konghq.com/)（Kong AI Portal）のデザイン言語を参照し、`services/frontend` を将来刷新する際の指針としてまとめたものです。

**位置づけ**: 今すぐ全面書き換えを行うための指示書ではなく、次回フロントエンドを大きく刷新するタイミングで参照する「目標デザイン」です。現状のフロントエンドは `services/frontend/src/app/globals.css` の "Liquid Glass Design System"（ライトテーマ・半透明ガラス風）で実装されており、本ドキュメントが指す方向はそこからの大きな転換（ダークテーマ・フラットデザイン）になります。

buildai.konghq.com は Kong 公式デザインシステム「KUI」（CSS カスタムプロパティ接頭辞 `--kui-*`）のトークンをそのまま使っており、以下の内容は 2026-07-08 時点で実際にページから採取した computed style / CSS カスタムプロパティに基づきます。

## デザインの方向性（personality）

- **ダーク × ネオングリーンのハイコントラスト**。黒背景にライム（`#CCFF00`）のアクセントを効かせ、「開発者向け AI インフラ」らしい技術的でクールな印象を作る。
- **大胆な太字見出し + ゆったりした余白**による、SaaS ランディングらしいスキャナビリティ（h1: 80px/font-weight 800）。
- **コード/ターミナル要素をヒーローに配置**し、開発者ファーストであることを視覚的に伝える。
- **装飾は最小限のフラットデザイン**。Liquid Glass のような `backdrop-filter` のぼかし・半透明・グロー系シャドウは使わない。

## カラーパレット

### ベース

| role                 | 現行（Liquid Glass）             | 目標（Kong AI Portal） | 用途                                           |
| -------------------- | -------------------------------- | ---------------------- | ---------------------------------------------- |
| `--bg`               | `#f0f0f0`                        | `#000000`              | ページ背景（ヘッダー/フッター）                |
| `--bg-alt`           | —                                | `#000F06`              | ヒーロー等の濃色セクション背景（わずかに緑味） |
| `--bg-surface`       | `rgba(255,255,255,.45)`（glass） | `#0D0E14`              | カード/サーフェス背景（不透明・フラット）      |
| `--bg-section-muted` | —                                | `#B7BDB5`              | 特徴紹介など明るめセクションの背景             |
| `--text`             | `#1a1a1a`                        | `#ffffff`              | 本文テキスト（濃色背景上）                     |
| `--text-muted`       | `#6b6b6b`                        | `#B7BDB5`              | 補助テキスト                                   |
| `--text-on-accent`   | —                                | `#000F06`              | アクセント背景上のテキスト（ボタン文字色など） |

### アクセント（Kong グリーン）

現行は accent/secondary の 2 系統（明るいハイライト用と、コントラスト確保用の濃いオリーブ）に分かれているが、目標パレットでは黒背景が前提のため 1 系統のスケールに統一する。

| role                | hex       | 用途                                                        |
| ------------------- | --------- | ----------------------------------------------------------- |
| `--accent-weakest`  | `#FAFFE6` | 極薄の背景ティント                                          |
| `--accent-weak`     | `#DBFF4D` | 薄いハイライト                                              |
| `--accent`          | `#CCFF00` | プライマリボタン・リンク・フォーカスリング                  |
| `--accent-strong`   | `#B8E600` | ボタン hover/active                                         |
| `--accent-stronger` | `#7A9900` | 濃色背景上でのアクセントテキスト（現行 `--secondary` 相当） |

### ステータス色（バッジ・アラート用）

KUI のステータストークンをそのまま採用し、現状 `globals.css` の `.status-*` / `.alert-*` で使っているアドホックな rgba 値を置き換える。

| ステータス | text      | bg (weakest) | border    |
| ---------- | --------- | ------------ | --------- |
| success    | `#00D6A4` | `#ECFFFB`    | `#00A17B` |
| warning    | `#FFC400` | `#FFFCE0`    | `#995C00` |
| danger     | `#FF3954` | `#FFE5E5`    | `#D60027` |
| info       | `#5F9AFF` | `#EEFAFF`    | `#0044F4` |

## タイポグラフィ

| 用途         | font-family                              | 備考                                                         |
| ------------ | ---------------------------------------- | ------------------------------------------------------------ |
| 見出し・本文 | `'Inter', Roboto, Helvetica, sans-serif` | 現行の `-apple-system, ...` システムフォントスタックから変更 |
| コード       | `'JetBrains Mono', Consolas, monospace`  | 新規追加。API サンプルやターミナル風 UI に使用               |

サイズ・ウェイト（buildai.konghq.com 実測値）:

- h1（ヒーロー）: 80px / weight 800 / letter-spacing -0.48px
- h2: 36px / weight 700 / letter-spacing -0.4px
- h3: 22px / weight 700 / letter-spacing -0.32px
- 本文（ヒーロー subhead）: 20px / weight 400
- ボタン: 16px / weight 600

## スペーシング・角丸

- **角丸は 6〜10px に統一する**（現行の 14〜24px の "ぽってり" した丸みから縮小）。KUI の `--kui-border-radius-30`(6px) がボタン、`-40`(8px) がカードやコードウィンドウの標準値。
- スペーシングは 4px グリッド（`--kui-space-*`: 4, 8, 12, 16, 20, 24, 32, 40...px）に沿わせる。

## コンポーネント

### ボタン

- **プライマリ**: 背景 `--accent`、文字 `--text-on-accent`、角丸 6px、padding `6px 12px`、weight 600、**シャドウ・グローなし**（現行 `.btn-primary` の `box-shadow` グローは撤去）。hover で背景を `--accent-strong` に。
- **セカンダリ（アウトライン）**: 背景透明、2px solid `--accent` ボーダー、文字 `--accent`。現行 `.btn-ghost` の半透明ガラス背景をこれに置き換える。
- `.btn-danger` は上記ステータス色の danger トークンを使う。

### カード / サーフェス

`.card` / `.order-card` / `.cart-item` の `backdrop-filter: blur(...)` と半透明背景を撤去し、`--bg-surface`（不透明）+ `1px solid rgba(255,255,255,.12)` のフラットな境界線に置き換える。ホバー時の `translateY` によるリフト演出は維持してよい。

### バッジ / ステータスピル

`.status-PENDING` 等の個別 rgba 定義を、上記ステータス色トークンを使う形に統一する。

### フォーム

入力欄は `--bg-surface` + 1px ボーダー、フォーカス時は `box-shadow: 0 0 0 4px rgba(204,255,0,0.2)`（KUI の `--kui-shadow-focus` と同一パターン）を使う。現行のフォーカスリングは既に同じ設計（色だけ `--secondary` 系）なので、色相の置き換えのみで移行できる。

### コードブロック（新規コンポーネント）

現状 `globals.css` に存在しない。ヒーロー画像で見られる「macOS 風 3 点ドット + ファイル名タブ + シンタックスハイライト」のターミナルウィンドウ UI を、Agent Service の API サンプルや `/admin` API キー curl 例の表示などに転用できる。フォントは `--font-family-code`、背景は `--bg-alt`。

## モチーフ

- ヒーロー背景の薄いグリッドパターン（現行の radial-gradient による "soft blob" 演出を置き換える候補）。
- ターミナル/コードウィンドウ chrome を繰り返し使うビジュアルデバイス。
- アクセントカラーによるネオンフォーカスリング（アクセシビリティ向けのフォーカス表示を兼ねる）。

## 移行方針

- `globals.css` は CSS カスタムプロパティ名（`--bg`, `--text`, `--accent`, `--secondary` 等）を維持したまま値だけ差し替えられる設計になっているため、トークン単位で段階的に移行可能。
- Liquid Glass 固有の `backdrop-filter` / 半透明背景 / グロー系シャドウは Kong 公式デザインには存在しないため、刷新時にまとめて撤去し flat design に統一する。
- 対象クラス一覧（置き換え対象）: `.nav`, `.card`, `.btn-primary`, `.btn-ghost`, `.form-group input`, `.cart-item`, `.order-card`, `.status-badge` 系, `.filter-btn`, `.auth-form`, `.toast`, `.ask-ai-fab` / `.ask-ai-dialog`。

## 対象外（Non-goals）

- 本ドキュメントはダークテーマへの即時全面移行を強制しない。実際の適用は次回フロントエンド刷新のタイミングで判断する。
- ライトモードを完全に廃止すべきかは別途 UX 観点での検討が必要（buildai.konghq.com はダークオンリーだが、本デモの EC サイトとしての見やすさ・商品訴求力への影響は未検証）。

## 参考

- https://buildai.konghq.com/ （Kong AI Portal。Kong 公式デザインシステム「KUI」のトークンをそのまま使用）
