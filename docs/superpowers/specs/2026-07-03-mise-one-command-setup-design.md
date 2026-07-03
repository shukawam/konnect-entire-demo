# mise 1 コマンドセットアップ 設計書

- 日付: 2026-07-03
- ブランチ: `feature/mise-one-command-setup`
- ステータス: 設計承認済み → 実装計画へ

## 1. 目的 / 背景

現状、このデモを起動するには次の手順を人手で順に実行する必要があり、手数が多く、順序や依存を読み解くのも難しい。

1. `cd kongctl && kongctl sync` で Konnect リソース一式を作成
2. 作成後に判明する `PREFIX` / `EVENT_GATEWAY_CP_ID` を `.env` に手書き
3. `deck gateway sync` で Control Plane に Gateway 設定を反映
4. `docker compose up -d` で起動
5. （前提）クラスタ証明書を Konnect にピン留め、`.env` の秘密値を記入

これを **`mise run setup` の 1 コマンド**に集約し、再現性のある起動を実現する。あわせて、既存 Konnect リソース（`order` / `catalog` などの API カタログ）と衝突せずに E2E を試せる**分離起動**の仕組みも用意する。

### ゴール

- `mise run setup` で「Konnect 同期 → 証明書ピン留め → `.env` 生成 → Gateway 同期 → コンテナ起動」を一括実行
- 証明書は**自己署名を自動生成し宣言的にピン留め**（人手のピン留め作業を撤廃）
- `.env` の動的値・大半の秘密値を**自動生成/自動抽出**
- `RESOURCE_PREFIX` により**本番リソースと衝突しない分離起動**（Tier A / Tier B）
- `mise.toml` は編集禁止のため**一切変更しない**（`.mise/tasks/` のファイルベースタスクで実現）

### ノンゴール

- CI/CD パイプライン化（将来課題）
- Keycloak realm の自動生成（realm-export.json は既存資産を利用）
- 複数 Konnect org / profile 切替（分離は同一 org 内の命名 + namespace で行う）

## 2. 人手で必要な前提（最終形）

自動化により、人手前提は次の 2 点のみに縮小する。

1. `.env` に `DECK_OPENAI_API_KEY` を記入（唯一の外部シークレット）
2. `kongctl login` 済み ＆ deck トークン設定済み（`~/.config/deck/.deck.yaml`）

上記以外（証明書、`AUTH_SECRET`、`AUTH_KEYCLOAK_SECRET`、`PREFIX`、`EVENT_GATEWAY_CP_ID` 等）はすべて自動。

## 3. 成果物：`.mise/tasks/` ファイルベースタスク

`mise.toml`（編集禁止）は触らず、`.mise/tasks/` 配下に実行可能スクリプトを置く。ファイル名がタスク名になり、サブディレクトリは `:` で名前空間化される（例: `.mise/tasks/konnect/sync` → `mise run konnect:sync`）。各スクリプト冒頭に `#MISE description="..."` を付ける。

### タスク一覧

| タスク         | ファイル                   | 責務                                                                                                                           |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `setup`        | `.mise/tasks/setup`        | オーケストレータ。`doctor → certs:gen → konnect:sync → env:patch → gateway:sync → up` を順に実行                               |
| `doctor`       | `.mise/tasks/doctor`       | 前提チェック（`DECK_OPENAI_API_KEY` 記入 / `kongctl` ログイン / deck トークン / Docker 起動）。不足を手順付きで列挙し非 0 終了 |
| `certs:gen`    | `.mise/tasks/certs/gen`    | `certs/kong-gateway/` `certs/event-gateway/` に `cluster.{crt,key}` が無ければ openssl で自己署名生成（あれば流用）            |
| `konnect:sync` | `.mise/tasks/konnect/sync` | （`RESOURCE_PREFIX` 指定時は）レンダリング → `kongctl sync`（`--base-dir` 指定で `../certs` を読む）                           |
| `env:patch`    | `.mise/tasks/env/patch`    | `.env` の動的値・秘密値をまとめて反映（詳細は §5）                                                                             |
| `gateway:sync` | `.mise/tasks/gateway/sync` | `deck gateway sync config/kong/kong.yaml`（`.env` の CP 名を対象に）                                                           |
| `up`           | `.mise/tasks/up`           | `docker compose up -d --build`                                                                                                 |
| `down`         | `.mise/tasks/down`         | `docker compose down`                                                                                                          |
| `teardown`     | `.mise/tasks/teardown`     | E2E 後始末（§6）。namespace 単位で `kongctl` 削除 ＋ `compose down -v` ＋ `.env` の分離値を復元                                |

### 共通ライブラリ

- `.mise/tasks/lib/common.sh` — リポジトリルート解決、`.env` の in-place パッチ関数、ログ出力ヘルパ
- `.mise/tasks/lib/render-kongctl.sh` — Tier B のレンダリング（§6）

タスクスクリプトは冒頭で `set -euo pipefail` を設定し、`common.sh` を source する。

## 4. setup オーケストレーションのフロー

```
doctor        前提（OPENAI キー / kongctl ログイン / deck トークン / Docker）を検証
  └─ certs:gen        自己署名証明書を生成（無ければ）
       └─ konnect:sync   kongctl sync → CP / Event GW / API / Portal 作成 + 証明書ピン留め
            └─ env:patch    Konnect 照会 + 秘密値生成/抽出 → .env の該当行を上書き
                 └─ gateway:sync  deck gateway sync → CP へ Gateway 設定 push
                      └─ up      docker compose up -d --build（Gateway が CP から設定 pull）
```

### 順序の根拠（現状の順序は正しい）

- `kongctl sync` は Control Plane を作成するため、それに依存する `deck gateway sync` より前でなければならない。
- 証明書ピン留めは `kongctl sync`（宣言リソース）に含まれるため、`certs:gen` はその前。
- `deck gateway sync` は CP へ設定を push するだけで、Gateway は起動後に CP から設定を pull するため、`compose up` の前でも後でも成立する。本設計では前に置く。

## 5. `.env` パッチ方式（`env:patch`）

既存 `.env` の**該当キーの行だけ**を in-place で書き換える（`sed`/`awk` で `^KEY=` 行を置換）。他行・コメント・秘密値は保持する。`.env` が無ければ `.env.example` からコピーして開始する。

| 変数                              | ソース / 生成方法                                                                                               | 冪等性                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------- | ------------------------------------ |
| `PREFIX`                          | `kongctl get gateway control-planes -o json` から対象 CP の control-plane endpoint を取り、サブドメイン部を抽出 | 毎回上書き                                       |
| `EVENT_GATEWAY_CP_ID`             | `kongctl get event-gateway <name> -o json`（または list）から `id` を抽出                                       | 毎回上書き                                       |
| `AUTH_SECRET`                     | プレースホルダ（`<your-auth-secret>`）または空のときのみ `openssl rand -base64 32` で生成。実値があれば温存     | 既存値は不変（セッション暗号鍵の再生成を避ける） |
| `AUTH_KEYCLOAK_SECRET`            | `config/keycloak/realm-export.json` の `clients[]                                                               | select(.clientId==$AUTH_KEYCLOAK_ID)             | .secret`を`jq` で抽出 | 毎回同期（realm が source of truth） |
| `DECK_KONNECT_CONTROL_PLANE_NAME` | `RESOURCE_PREFIX` 指定時は接頭辞付き CP 名、未指定時は `jungle-store-gateway`                                   | プレフィックスに追従                             |
| `DECK_OPENAI_API_KEY`             | 人手入力（検証のみ）。未設定なら `doctor` が停止                                                                | 触らない                                         |

### PREFIX 抽出の詳細

`PREFIX` は `<prefix>.us.cp.konghq.com` のサブドメイン部。`kongctl get gateway control-planes -o json` の応答から対象 CP を名前で絞り込み、control-plane endpoint（例: `https://4fa752f311.us.cp.konghq.com`）の先頭ラベルを取り出す。

> **実装時に実値確認が必要**: JSON のフィールド名（`config.control_plane_endpoint` 等）は環境で `kongctl get gateway control-planes -o json` を実行して確定する。設計時は本ツールが未ログイン（401）で確認できていない。フィールド名は防御的に（複数候補を `jq` で試す / `// empty` フォールバック）扱う。

## 6. 分離起動：`RESOURCE_PREFIX`（Tier A + Tier B）

環境変数 `RESOURCE_PREFIX`（例: `e2e`）を設定すると、本番リソースと衝突しない一式を作成する。未設定時は現行の `kongctl/` をそのまま使い、挙動は不変。

### 命名規則（`RESOURCE_PREFIX=e2e` の例）

| 対象                           | 既定                         | 分離時                           |
| ------------------------------ | ---------------------------- | -------------------------------- |
| kongctl namespace              | `jungle-store`               | `jungle-store-e2e`               |
| Gateway CP 名                  | `jungle-store-gateway`       | `jungle-store-gateway-e2e`       |
| Event Gateway 名               | `jungle-store-event-gateway` | `jungle-store-event-gateway-e2e` |
| API 名（`catalog-api` 等）     | OpenAPI `info.title`         | `<title>-e2e`（Tier B）          |
| Portal 名                      | 現状値                       | `<name>-e2e`（Tier B）           |
| deck ターゲット / `.env` CP 名 | `jungle-store-gateway`       | `jungle-store-gateway-e2e`       |

**別 namespace で管理する意義**: `teardown` が namespace 単位で削除でき、本番リソースを巻き込まない。

### Tier A（ランタイム分離）

アプリを E2E で動かすのに必要な **Gateway CP と Event Gateway のみ**を接頭辞付きで作成し、`deck sync` + `compose up` でフル動作を検証する。API/Portal カタログ（衝突源）は作らない。実装コストが小さい。

### Tier B（カタログ含む完全分離）

Tier A に加え、全 API/Portal 名も接頭辞化して Developer Portal カタログ表示まで検証する。API 名は OpenAPI の `info.title` を `!file` 参照しているため、**レンダリング step**（`render-kongctl.sh`）で実現する。

`render-kongctl.sh` の処理:

1. `kongctl/` をスクラッチ（例: `.tmp/kongctl-render/`）へコピー
2. `RESOURCE_PREFIX` があれば `yq` で以下を接頭辞化:
   - `control-planes.yaml`・`event-gateways.yaml`・`apis.yaml`・`portals.yaml`・`portal-teams.yaml` の `name:` フィールド（Konnect に見える名前）
   - `_defaults.kongctl.namespace`（`jungle-store` → `jungle-store-e2e`）
   - コピーした各 `portals/apis/*/openapi.yaml` の `info.title`（→ `!file ...#info.title` 経由で API 名が接頭辞化される）
3. `ref:` は設定内のローカル論理名のため**接頭辞化しない**（`!ref` の解決を壊さない）
4. `kongctl sync -f .tmp/kongctl-render --base-dir <repo-root>` を実行

`RESOURCE_PREFIX` 未設定時はレンダリングをスキップし、`kongctl/` を直接 `-f` する。

> **注意**: `info.title` を書き換えるとポータルに表示される仕様タイトルも変わる（テスト用途では許容）。

## 7. 証明書の自動化（自己署名 + 宣言ピン留め）

`kongctl` の宣言リソースで DP クライアント証明書をピン留めできることを確認済み。

- `control_plane.data_plane_certificates`（root key `control_plane_data_plane_certificates[]`）: `cert`（PEM, 必須）
- `event_gateway.data_plane_certificates`（root key `event_gateway_data_plane_certificates[]`）: `certificate`（PEM, 必須）

### kongctl 設定への追記

`kongctl/control-planes.yaml` の CP に:

```yaml
data_plane_certificates:
  - ref: jungle-store-gateway-cert
    cert: !file ../certs/kong-gateway/cluster.crt
```

`kongctl/event-gateways.yaml` の Event GW に:

```yaml
data_plane_certificates:
  - ref: jungle-store-event-gateway-cert
    certificate: !file ../certs/event-gateway/cluster.crt
```

`certs/` は `kongctl/` の外なので、`kongctl sync` 時に `--base-dir <repo-root>` を付け `!file ../certs/...` の解決を許可する。

### 証明書生成（`certs:gen`）

`cluster.{crt,key}` が無い場合のみ openssl で自己署名生成:

```bash
openssl req -new -x509 -nodes -newkey rsa:2048 -days 1095 \
  -keyout certs/kong-gateway/cluster.key \
  -out    certs/kong-gateway/cluster.crt \
  -subj "/CN=jungle-store" -sha256
```

Event Gateway 用も同様に `certs/event-gateway/` に生成する。`certs/` は gitignore 済みのため生成物はコミットされない。

### 動作の含意

- プレフィックス無しの `setup` は既存 `jungle-store-gateway` CP に、`certs/` にある証明書を宣言管理下でピン留めする。DP が提示する `cluster.crt/key` と同一ファイルのため接続は成立。
- 既存 `certs/` が Konnect 発行証明書だった場合も、そのファイルをそのままピンするため不整合は起きない（複数証明書のピン留めは加算的）。

## 8. `doctor` の検証項目

1. `.env` の `DECK_OPENAI_API_KEY` が実値（プレースホルダでない）
2. `kongctl` がログイン済み（`kongctl get me` 等が成功）
3. deck トークンが利用可能（`~/.config/deck/.deck.yaml` の存在 / `deck gateway ping` 等）
4. Docker デーモンが起動（`docker info`）

不足時は各項目の対処コマンドを提示し非 0 終了。証明書・他シークレット・Konnect 動的値はチェック対象外（自動生成/抽出のため）。

## 9. `teardown`（E2E 後始末）

`RESOURCE_PREFIX` 指定時を主用途とする:

1. `docker compose down -v`（コンテナ + ボリューム削除）
2. namespace 単位で Konnect リソース削除（`kongctl` の空設定 sync を対象 namespace にスコープ、または `kongctl delete` を namespace 指定）— 本番 namespace（`jungle-store`）には触れない
3. `.env` の分離で書き換えた値（`DECK_KONNECT_CONTROL_PLANE_NAME`・`PREFIX`・`EVENT_GATEWAY_CP_ID`）を元へ戻す（分離前のバックアップ or `.env.example` 既定へ）

> namespace スコープ削除の正確なコマンド形（`kongctl sync --require-namespace` / `kongctl delete`）は実装時に `kongctl` ヘルプで確定する。

## 10. 既存資産との関係

- `mise.toml` の既存タスク `sync-konnect`（`deck gateway sync` をハードコード）は編集禁止のため残置。新設の `gateway:sync` が正準となる。将来ユーザーが `sync-konnect` を削除する想定。
- README.md / CLAUDE.md のセットアップ手順を新フローに合わせて更新する（別途）。CLAUDE.md の「Kong / Konnect への設定反映」節に `mise run setup` を追記。

## 11. 実装時に実地確認が必要な既知リスク（要検証リスト）

1. `kongctl get gateway control-planes -o json` の **PREFIX 該当フィールド名**（control-plane endpoint）
2. `kongctl get event-gateway ... -o json` の **`id` 取得パス**とサブコマンド形
3. `data_plane_certificates` を含む `kongctl sync` の `!file ../certs` 解決（`--base-dir` の正しい指定）
4. namespace スコープの `teardown` 削除コマンド形
5. Tier B レンダリング後の `!ref` / `!file` 解決が `--base-dir` 下で壊れないこと

いずれもユーザー環境（`kongctl` ログイン済み）での実行により確定する。

## 12. 検証方針

- 各タスクは単体で冪等に再実行できること（`setup` 二度打ちで差分が出ない/破壊されない）
- `RESOURCE_PREFIX` 未設定時に既存挙動が不変であること（レンダリングスキップ）
- `RESOURCE_PREFIX=e2e` で本番リソースに触れずに一式が作成・削除できること
- スモークテストは既存の `verify-stack` スキルを流用（ヘルスチェック / Kong プラグイン / Kafka フロー）
- シェルスクリプトは `bash -n` 構文チェック ＋ 主要分岐の手動実行で確認
