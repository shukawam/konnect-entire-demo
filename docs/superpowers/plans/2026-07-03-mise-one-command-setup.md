# mise 1コマンドセットアップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mise run setup` の 1 コマンドで「Konnect 同期 → 自己署名証明書のピン留め → `.env` 生成 → Gateway 同期 → コンテナ起動」を完遂し、`RESOURCE_PREFIX` で本番と衝突しない分離起動も可能にする。

**Architecture:** `mise.toml`（編集禁止）は変更せず、`.mise/tasks/` 配下のファイルベースタスク（サブディレクトリ = `:` 名前空間）で実装する。共有ロジックは mise のタスク誤検出を避けるため `.mise/lib/`（タスクスキャン対象外）に置く。証明書は openssl で自己署名生成し、kongctl の宣言リソース `data_plane_certificates` でピン留めする。分離は kongctl 設定を `yq` でレンダリングして命名を接頭辞化する。

**Tech Stack:** bash, mise（ファイルベースタスク）, kongctl 1.2.1, decK, docker compose, openssl, jq 1.7, yq v4。

## Global Constraints

- 実装は `feature/mise-one-command-setup` ブランチで行い、PR 経由で main へマージする（main 直コミット禁止）。
- `mise.toml` / `.env` / `certs/` は**手で編集しない**（フック + `permissions.deny` でブロック）。これらへの書き込みは**タスク実行時のランタイム処理**として行う。
- コミットメッセージはセマンティックコミット規約（例: `feat:` `docs:` `test:`）。
- コードスタイルは Prettier（pre-commit で自動整形。シェルは対象外だが 2 スペースインデントで統一）。
- 全シェルスクリプトは冒頭で `set -euo pipefail`、`.mise/lib/common.sh` を source する（タスクのみ。lib 自身は source されない前提で `set` を持つ）。
- タスクファイルは実行可能（`chmod +x`）にし、shebang `#!/usr/bin/env bash` と `#MISE description="..."` を付ける。
- 命名規則（`RESOURCE_PREFIX` 指定時、例 `e2e`）: namespace=`jungle-store-e2e`、CP=`jungle-store-gateway-e2e`、Event GW=`jungle-store-event-gateway-e2e`、Portal=`jungle-store-dev-portal-e2e`、API 名=OpenAPI `info.title` に `-e2e` 接尾。`ref` は不変。

---

## File Structure

新規作成:

- `.mise/lib/common.sh` — 共有ヘルパ（`REPO_ROOT`/`ENV_FILE`、`log/warn/die`、`env_get`/`env_set`）
- `.mise/lib/render-kongctl.sh` — kongctl 設定のレンダリング（接頭辞化）。同期ソースのパスを stdout に出力
- `.mise/lib/selftest.sh` — `env_set`/`env_get`・PREFIX 抽出・レンダリングのローカルテスト（Konnect 不要）
- `.mise/tasks/selftest` — `selftest.sh` を実行するタスク
- `.mise/tasks/doctor` — 前提チェック
- `.mise/tasks/certs/gen` — 自己署名証明書生成
- `.mise/tasks/konnect/sync` — 証明書ステージ + `kongctl sync`
- `.mise/tasks/env/patch` — `.env` 反映（動的値 + 秘密値）
- `.mise/tasks/gateway/sync` — `deck gateway sync`
- `.mise/tasks/up` / `.mise/tasks/down` — compose 起動/停止
- `.mise/tasks/teardown` — 分離環境の後始末
- `.mise/tasks/setup` — オーケストレータ

変更:

- `kongctl/control-planes.yaml` — `data_plane_certificates` 追記
- `kongctl/event-gateways.yaml` — `data_plane_certificates` 追記
- `.gitignore` — `.tmp/` と `kongctl/.certs/` を追加
- `README.md` / `CLAUDE.md` — セットアップ手順に `mise run setup` を反映

---

## Task 1: 共有ライブラリ `common.sh` と TDD

**Files:**

- Create: `.mise/lib/common.sh`
- Create: `.mise/lib/selftest.sh`（このタスクでは env 関数分のみ）
- Create: `.mise/tasks/selftest`

**Interfaces:**

- Produces:
  - `env_get KEY [FILE]` → 値を stdout（無ければ空）
  - `env_set KEY VALUE [FILE]` → `^KEY=` 行を置換、無ければ追記（`FILE` 既定 `$ENV_FILE`）
  - グローバル `REPO_ROOT`, `ENV_FILE`、関数 `log`/`warn`/`die`

- [ ] **Step 1: 失敗するテストを書く**（`.mise/lib/selftest.sh`）

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/common.sh"
fail=0
assert_eq() { [ "$1" = "$2" ] || { echo "FAIL [$3]: expected [$2] got [$1]"; fail=1; }; }

# --- env_set / env_get ---
tmp="$(mktemp)"
printf 'PREFIX=<your-konnect-endpoint-prefix>\nAUTH_URL=http://localhost:3000\n' >"$tmp"
env_set PREFIX abc123 "$tmp"
assert_eq "$(env_get PREFIX "$tmp")" "abc123" "replace"
assert_eq "$(env_get AUTH_URL "$tmp")" "http://localhost:3000" "untouched"
env_set NEW hello "$tmp"
assert_eq "$(env_get NEW "$tmp")" "hello" "append"
env_set AUTH_SECRET "a/b+c=d==" "$tmp"
assert_eq "$(env_get AUTH_SECRET "$tmp")" "a/b+c=d==" "special-chars"
rm -f "$tmp"

[ "$fail" = 0 ] && echo "ALL PASS" || { echo "SELFTEST FAILED"; exit 1; }
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `bash .mise/lib/selftest.sh`
Expected: FAIL（`common.sh` が無く `source` でエラー）

- [ ] **Step 3: `common.sh` を実装**（`.mise/lib/common.sh`）

```bash
#!/usr/bin/env bash
# 共通ヘルパ。各タスクスクリプトから source する。
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# env_get KEY [FILE] → 値を stdout（無ければ空）
env_get() {
  local key="$1" file="${2:-$ENV_FILE}"
  [ -f "$file" ] || return 0
  awk -F= -v k="$key" '$1==k { sub(/^[^=]*=/,""); print; exit }' "$file"
}

# env_set KEY VALUE [FILE] → ^KEY= 行を置換、無ければ追記
env_set() {
  local key="$1" val="$2" file="${3:-$ENV_FILE}"
  [ -f "$file" ] || die ".env が見つかりません: $file"
  local tmp; tmp="$(mktemp)"
  KEY="$key" VAL="$val" awk '
    BEGIN { key=ENVIRON["KEY"]; val=ENVIRON["VAL"]; found=0 }
    $0 ~ "^" key "=" { print key "=" val; found=1; next }
    { print }
    END { if (!found) print key "=" val }
  ' "$file" >"$tmp"
  mv "$tmp" "$file"
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `bash .mise/lib/selftest.sh`
Expected: `ALL PASS`

- [ ] **Step 5: `selftest` タスクを作成**（`.mise/tasks/selftest`）

```bash
#!/usr/bin/env bash
#MISE description="セットアップスクリプトのローカルテスト（Konnect 不要）"
set -euo pipefail
exec bash "$(git rev-parse --show-toplevel)/.mise/lib/selftest.sh"
```

- [ ] **Step 6: 実行権限付与とタスク認識確認**

Run: `chmod +x .mise/tasks/selftest && mise run selftest`
Expected: `ALL PASS`

- [ ] **Step 7: コミット**

```bash
git add .mise/lib/common.sh .mise/lib/selftest.sh .mise/tasks/selftest
git commit -m "feat: mise セットアップ用共有ライブラリと selftest を追加"
```

---

## Task 2: `certs:gen` タスク（自己署名証明書生成）

**Files:**

- Create: `.mise/tasks/certs/gen`
- Modify: `.gitignore`（`.tmp/`, `kongctl/.certs/` 追加）

**Interfaces:**

- Produces: `certs/kong-gateway/cluster.{crt,key}`, `certs/event-gateway/cluster.{crt,key}`（無ければ生成、あれば流用）

- [ ] **Step 1: `.gitignore` に追記**

`.gitignore` の末尾に以下を追加（既存の `certs/` 行はそのまま）:

```
.tmp/
kongctl/.certs/
```

- [ ] **Step 2: `certs/gen` タスクを実装**

```bash
#!/usr/bin/env bash
#MISE description="自己署名クラスタ証明書を生成（既存なら流用）"
set -euo pipefail
source "$(git rev-parse --show-toplevel)/.mise/lib/common.sh"

gen_cert() {
  local dir="$1" cn="$2"
  mkdir -p "$dir"
  if [ -f "$dir/cluster.crt" ] && [ -f "$dir/cluster.key" ]; then
    log "証明書は既存: $dir（流用）"
    return 0
  fi
  log "自己署名証明書を生成: $dir"
  openssl req -new -x509 -nodes -newkey rsa:2048 -days 1095 -sha256 \
    -keyout "$dir/cluster.key" -out "$dir/cluster.crt" -subj "/CN=$cn"
}

gen_cert "$REPO_ROOT/certs/kong-gateway"  "jungle-store-gateway"
gen_cert "$REPO_ROOT/certs/event-gateway" "jungle-store-event-gateway"
log "証明書 OK"
```

- [ ] **Step 3: 実行して証明書生成を確認**

Run: `chmod +x .mise/tasks/certs/gen && mise run certs:gen`
Expected: 各ディレクトリに `cluster.crt` / `cluster.key` が生成され、`証明書 OK`

- [ ] **Step 4: 冪等性を確認（2 回目は流用）**

Run: `mise run certs:gen`
Expected: `証明書は既存: ...（流用）` が 2 行、ファイルの mtime が変わらない

- [ ] **Step 5: 証明書の妥当性を確認**

Run: `openssl x509 -in certs/kong-gateway/cluster.crt -noout -subject`
Expected: `subject=CN=jungle-store-gateway`（または `subject= CN = jungle-store-gateway`）

- [ ] **Step 6: コミット**

`certs/` は gitignore 済みのため生成物はコミットされない。タスクと gitignore のみコミット:

```bash
git add .mise/tasks/certs/gen .gitignore
git commit -m "feat: 自己署名クラスタ証明書を生成する certs:gen タスクを追加"
```

---

## Task 3: kongctl 設定に証明書ピン留めを追記

**Files:**

- Modify: `kongctl/control-planes.yaml`
- Modify: `kongctl/event-gateways.yaml`

**Interfaces:**

- Consumes: `certs/*/cluster.crt`（Task 5 が `.certs/*.crt` としてステージ）
- Produces: 同期ソース配下 `.certs/kong-gateway.crt` / `.certs/event-gateway.crt` を `!file` 参照する宣言

- [ ] **Step 1: `control-planes.yaml` に `data_plane_certificates` を追記**

`kongctl/control-planes.yaml` の `control_planes[0]`（`labels:` ブロックの後）に追記:

```yaml
data_plane_certificates:
  - ref: jungle-store-gateway-cert
    cert: !file .certs/kong-gateway.crt
```

- [ ] **Step 2: `event-gateways.yaml` に `data_plane_certificates` を追記**

`kongctl/event-gateways.yaml` の `event_gateways[0]` 直下（`labels:` ブロックの後、`backend_clusters:` の前）に追記:

```yaml
data_plane_certificates:
  - ref: jungle-store-event-gateway-cert
    certificate: !file .certs/event-gateway.crt
```

- [ ] **Step 3: YAML 妥当性を確認**

Run: `yq '.control_planes[0].data_plane_certificates[0].ref' kongctl/control-planes.yaml`
Expected: `jungle-store-gateway-cert`

Run: `yq '.event_gateways[0].data_plane_certificates[0].ref' kongctl/event-gateways.yaml`
Expected: `jungle-store-event-gateway-cert`

> 注: `!file .certs/*.crt` の実体は Task 5 の `konnect:sync` が同期直前にステージする。ここでの `kongctl` 実同期は Task 9 の統合確認で行う。

- [ ] **Step 4: コミット**

```bash
git add kongctl/control-planes.yaml kongctl/event-gateways.yaml
git commit -m "feat: kongctl 設定に自己署名証明書のピン留めを追加"
```

---

## Task 4: `render-kongctl.sh`（分離レンダリング）と TDD

**Files:**

- Create: `.mise/lib/render-kongctl.sh`
- Modify: `.mise/lib/selftest.sh`（レンダリングと PREFIX 抽出のテストを追加）

**Interfaces:**

- Consumes: 環境変数 `RESOURCE_PREFIX`（空可）
- Produces: 同期ソースディレクトリのパスを stdout に 1 行出力。`RESOURCE_PREFIX` 空なら `$REPO_ROOT/kongctl`、指定時は `$REPO_ROOT/.tmp/kongctl-render`（接頭辞化済みコピー）

- [ ] **Step 1: `selftest.sh` に失敗するテストを追加**

`.mise/lib/selftest.sh` の `rm -f "$tmp"` の後、最終行（`[ "$fail" = 0 ]...`）の前に挿入:

```bash
# --- PREFIX 抽出 jq（env:patch と同一式）---
sample='{"data":[{"name":"jungle-store-gateway","config":{"control_plane_endpoint":"https://4fa752f311.us.cp.konghq.com"}}]}'
ep="$(printf '%s' "$sample" | jq -r --arg n jungle-store-gateway '(.data // .)|(if type=="array" then . else [.] end)|map(select(.name==$n))|.[0]|(.config.control_plane_endpoint // .config.controlPlaneEndpoint // .control_plane_endpoint // empty)')"
pfx="$(printf '%s' "$ep" | sed -E 's#^https?://##; s#\..*$##')"
assert_eq "$pfx" "4fa752f311" "prefix-extract"

# --- render: passthrough / prefix ---
out="$(RESOURCE_PREFIX= bash "$DIR/render-kongctl.sh")"
assert_eq "$out" "$REPO_ROOT/kongctl" "render-passthrough"
out="$(RESOURCE_PREFIX=selftest bash "$DIR/render-kongctl.sh")"
assert_eq "$(yq '.control_planes[0].name' "$out/control-planes.yaml")" "jungle-store-gateway-selftest" "render-cp-name"
assert_eq "$(yq '._defaults.kongctl.namespace' "$out/control-planes.yaml")" "jungle-store-selftest" "render-ns"
assert_eq "$(yq '.event_gateways[0].name' "$out/event-gateways.yaml")" "jungle-store-event-gateway-selftest" "render-eg-name"
assert_eq "$(yq '.portals[0].name' "$out/portals.yaml")" "jungle-store-dev-portal-selftest" "render-portal-name"
title="$(yq '.info.title' "$out/portals/apis/catalog/openapi.yaml")"
case "$title" in *-selftest) ;; *) echo "FAIL [render-title]: got [$title]"; fail=1 ;; esac
rm -rf "$REPO_ROOT/.tmp/kongctl-render"
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `bash .mise/lib/selftest.sh`
Expected: FAIL（`render-kongctl.sh` が無い）

- [ ] **Step 3: `render-kongctl.sh` を実装**

```bash
#!/usr/bin/env bash
# kongctl/ を接頭辞付きでレンダリングし、同期ソースのパスを stdout に出力する。
# RESOURCE_PREFIX が空なら kongctl/ をそのまま出力（コピーなし）。
# 診断出力は stderr のみ（stdout はパス 1 行に限定）。
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

prefix="${RESOURCE_PREFIX:-}"
src="$REPO_ROOT/kongctl"

if [ -z "$prefix" ]; then
  printf '%s\n' "$src"
  exit 0
fi

out="$REPO_ROOT/.tmp/kongctl-render"
rm -rf "$out"; mkdir -p "$(dirname "$out")"
cp -R "$src" "$out"

# namespace を全ファイルで差し替え
for f in "$out"/*.yaml; do
  P="jungle-store-$prefix" yq -i '(._defaults.kongctl.namespace) |= strenv(P)' "$f"
done
# Konnect 可視名を接頭辞化（ref は不変）
S="-$prefix" yq -i '(.control_planes[].name) |= . + strenv(S)' "$out/control-planes.yaml"
S="-$prefix" yq -i '(.event_gateways[].name) |= . + strenv(S)' "$out/event-gateways.yaml"
S="-$prefix" yq -i '(.portals[].name) |= . + strenv(S)' "$out/portals.yaml"
# API 名は OpenAPI info.title 由来 → コピーした spec の title を接頭辞化
for spec in "$out"/portals/apis/*/openapi.yaml; do
  S="-$prefix" yq -i '(.info.title) |= . + strenv(S)' "$spec"
done

printf '%s\n' "$out"
```

- [ ] **Step 4: 実行して成功を確認**

Run: `bash .mise/lib/selftest.sh`
Expected: `ALL PASS`

- [ ] **Step 5: コミット**

```bash
git add .mise/lib/render-kongctl.sh .mise/lib/selftest.sh
git commit -m "feat: RESOURCE_PREFIX で kongctl 設定を分離レンダリングする render スクリプトを追加"
```

---

## Task 5: `konnect:sync` タスク（証明書ステージ + kongctl sync）

**Files:**

- Create: `.mise/tasks/konnect/sync`

**Interfaces:**

- Consumes: `render-kongctl.sh`（ソースパス）、`certs/*/cluster.crt`
- Produces: Konnect に CP / Event GW / API / Portal / 証明書ピン留めを反映

- [ ] **Step 1: `konnect:sync` タスクを実装**

```bash
#!/usr/bin/env bash
#MISE description="Konnect リソースを同期（自己署名証明書のピン留め含む）"
set -euo pipefail
source "$(git rev-parse --show-toplevel)/.mise/lib/common.sh"

SRC="$(bash "$REPO_ROOT/.mise/lib/render-kongctl.sh")"
log "kongctl source: $SRC"

# 証明書 PEM を同期ソース配下 .certs/ にステージ（YAML の !file .certs/... が参照）
mkdir -p "$SRC/.certs"
cp "$REPO_ROOT/certs/kong-gateway/cluster.crt"  "$SRC/.certs/kong-gateway.crt"
cp "$REPO_ROOT/certs/event-gateway/cluster.crt" "$SRC/.certs/event-gateway.crt"

kongctl sync -f "$SRC" --auto-approve
log "kongctl sync 完了"
```

- [ ] **Step 2: 構文チェック**

Run: `chmod +x .mise/tasks/konnect/sync && bash -n .mise/tasks/konnect/sync`
Expected: エラーなし

- [ ] **Step 3: ドライ確認（証明書ステージのみ、sync はしない）**

Run: `SRC="$(bash .mise/lib/render-kongctl.sh)"; mkdir -p "$SRC/.certs"; cp certs/kong-gateway/cluster.crt "$SRC/.certs/kong-gateway.crt"; kongctl plan -f "$SRC" >/dev/null && echo PLAN_OK`
Expected: `PLAN_OK`（要 kongctl ログイン。未ログインなら Task 9 の統合確認へ回す）

> `kongctl plan` が `!file .certs/...` を解決できることの確認。event-gateway 証明書も同様に事前ステージが必要な場合は両方コピーする。

- [ ] **Step 4: コミット**

```bash
git add .mise/tasks/konnect/sync
git commit -m "feat: 証明書ステージ付きの konnect:sync タスクを追加"
```

---

## Task 6: `env:patch` タスク（.env 反映）

**Files:**

- Create: `.mise/tasks/env/patch`

**Interfaces:**

- Consumes: `env_get`/`env_set`（common.sh）、`RESOURCE_PREFIX`、`config/keycloak/realm-export.json`、Konnect（kongctl get）
- Produces: `.env` の `PREFIX`/`EVENT_GATEWAY_CP_ID`/`AUTH_SECRET`/`AUTH_KEYCLOAK_SECRET`/`DECK_KONNECT_CONTROL_PLANE_NAME` を反映

- [ ] **Step 1: `env:patch` タスクを実装**

```bash
#!/usr/bin/env bash
#MISE description=".env に動的値・秘密値を反映（PREFIX/CP_ID/AUTH_SECRET 等）"
set -euo pipefail
source "$(git rev-parse --show-toplevel)/.mise/lib/common.sh"

[ -f "$ENV_FILE" ] || { cp "$REPO_ROOT/.env.example" "$ENV_FILE"; log ".env を .env.example から作成"; }

prefix="${RESOURCE_PREFIX:-}"
cp_name="jungle-store-gateway${prefix:+-$prefix}"
eg_name="jungle-store-event-gateway${prefix:+-$prefix}"

# --- Gateway CP endpoint → PREFIX ---
cp_json="$(kongctl get gateway control-planes -o json)"
endpoint="$(printf '%s' "$cp_json" | jq -r --arg n "$cp_name" '
  (.data // .) | (if type=="array" then . else [.] end)
  | map(select(.name==$n)) | .[0]
  | (.config.control_plane_endpoint // .config.controlPlaneEndpoint // .control_plane_endpoint // empty)')"
[ -n "$endpoint" ] || die "control-plane endpoint を取得できませんでした（CP: $cp_name / JSON フィールド名を確認）"
pfx="$(printf '%s' "$endpoint" | sed -E 's#^https?://##; s#\..*$##')"
env_set PREFIX "$pfx"
log "PREFIX=$pfx"

# --- Event Gateway id ---
eg_json="$(kongctl get event-gateways -o json 2>/dev/null || kongctl get event-gateway -o json)"
eg_id="$(printf '%s' "$eg_json" | jq -r --arg n "$eg_name" '
  (.data // .) | (if type=="array" then . else [.] end)
  | map(select(.name==$n)) | .[0] | (.id // .control_plane_id // empty)')"
[ -n "$eg_id" ] || die "event gateway id を取得できませんでした（EG: $eg_name）"
env_set EVENT_GATEWAY_CP_ID "$eg_id"
log "EVENT_GATEWAY_CP_ID=$eg_id"

# --- deck ターゲット CP 名 ---
env_set DECK_KONNECT_CONTROL_PLANE_NAME "$cp_name"

# --- AUTH_SECRET（プレースホルダ/空のみ生成）---
cur="$(env_get AUTH_SECRET)"
case "$cur" in
  ""|"<your-auth-secret>") env_set AUTH_SECRET "$(openssl rand -base64 32)"; log "AUTH_SECRET を生成";;
  *) log "AUTH_SECRET は既存値を温存";;
esac

# --- AUTH_KEYCLOAK_SECRET（realm-export.json から抽出）---
kc_id="$(env_get AUTH_KEYCLOAK_ID)"; kc_id="${kc_id:-jungle-store-frontend}"
realm="$REPO_ROOT/config/keycloak/realm-export.json"
secret="$(jq -r --arg id "$kc_id" '.clients[]? | select(.clientId==$id) | .secret // empty' "$realm")"
if [ -n "$secret" ]; then env_set AUTH_KEYCLOAK_SECRET "$secret"; log "AUTH_KEYCLOAK_SECRET を realm から同期"; else warn "realm に client secret が見つかりません: $kc_id"; fi

log "env:patch 完了"
```

- [ ] **Step 2: 構文チェック**

Run: `chmod +x .mise/tasks/env/patch && bash -n .mise/tasks/env/patch`
Expected: エラーなし

- [ ] **Step 3: 秘密値ロジックのローカル検証（Konnect 非依存部分）**

Run:

```bash
tmp="$(mktemp)"; printf 'AUTH_SECRET=<your-auth-secret>\nAUTH_KEYCLOAK_ID=jungle-store-frontend\nAUTH_KEYCLOAK_SECRET=x\n' >"$tmp"
ENV_FILE="$tmp" bash -c '
source .mise/lib/common.sh
cur="$(env_get AUTH_SECRET)"; [ "$cur" = "<your-auth-secret>" ] && env_set AUTH_SECRET "$(openssl rand -base64 32)"
kc_id="$(env_get AUTH_KEYCLOAK_ID)"
sec="$(jq -r --arg id "$kc_id" ".clients[]? | select(.clientId==\$id) | .secret // empty" config/keycloak/realm-export.json)"
env_set AUTH_KEYCLOAK_SECRET "$sec"
'
grep -q "^AUTH_SECRET=" "$tmp" && ! grep -q "your-auth-secret" "$tmp" && echo AUTH_SECRET_OK
grep -q "^AUTH_KEYCLOAK_SECRET=uUR3Hw1eULoult6FdWkQUtu7QlOeW6tO" "$tmp" && echo KC_SECRET_OK
rm -f "$tmp"
```

Expected: `AUTH_SECRET_OK` と `KC_SECRET_OK`

- [ ] **Step 4: コミット**

```bash
git add .mise/tasks/env/patch
git commit -m "feat: .env に動的値・秘密値を反映する env:patch タスクを追加"
```

---

## Task 7: `doctor` タスク（前提チェック）

**Files:**

- Create: `.mise/tasks/doctor`

**Interfaces:**

- Produces: 前提（OPENAI キー / kongctl ログイン / deck トークン / Docker）を検証。不足時は手順を表示し非 0 終了

- [ ] **Step 1: `doctor` タスクを実装**

```bash
#!/usr/bin/env bash
#MISE description="セットアップ前提を検証（OPENAI キー / kongctl / deck / Docker）"
set -euo pipefail
source "$(git rev-parse --show-toplevel)/.mise/lib/common.sh"

[ -f "$ENV_FILE" ] || { cp "$REPO_ROOT/.env.example" "$ENV_FILE"; log ".env を .env.example から作成"; }

ok=1
check() { if eval "$2" >/dev/null 2>&1; then log "OK: $1"; else warn "NG: $1 → $3"; ok=0; fi; }

openai="$(env_get DECK_OPENAI_API_KEY)"
case "$openai" in
  ""|"<your-openai-api-key>"|"sk-...") warn "NG: DECK_OPENAI_API_KEY 未設定 → .env に実キーを記入"; ok=0;;
  *) log "OK: DECK_OPENAI_API_KEY";;
esac

check "kongctl ログイン" "kongctl get me" "kongctl login を実行"
check "deck Konnect 認証" "test -f $HOME/.config/deck/.deck.yaml" "deck の Konnect トークンを ~/.config/deck/.deck.yaml に設定"
check "Docker 起動" "docker info" "Docker Desktop を起動"

[ "$ok" = 1 ] || die "前提が未充足です。上記を解消して再実行してください。"
log "doctor: 全チェック OK"
```

- [ ] **Step 2: 構文チェックと実行**

Run: `chmod +x .mise/tasks/doctor && bash -n .mise/tasks/doctor && mise run doctor || true`
Expected: 各項目に OK/NG が表示される（環境により NG があってもこのステップは可）

- [ ] **Step 3: コミット**

```bash
git add .mise/tasks/doctor
git commit -m "feat: 前提チェックを行う doctor タスクを追加"
```

---

## Task 8: `gateway:sync` / `up` / `down` タスク

**Files:**

- Create: `.mise/tasks/gateway/sync`
- Create: `.mise/tasks/up`
- Create: `.mise/tasks/down`

**Interfaces:**

- Consumes: `.env` の `DECK_KONNECT_CONTROL_PLANE_NAME`
- Produces: deck 同期 / compose 起動・停止

- [ ] **Step 1: `gateway:sync` タスクを実装**

```bash
#!/usr/bin/env bash
#MISE description="deck で Gateway 設定を Control Plane へ同期"
set -euo pipefail
source "$(git rev-parse --show-toplevel)/.mise/lib/common.sh"
cp_name="$(env_get DECK_KONNECT_CONTROL_PLANE_NAME)"; cp_name="${cp_name:-jungle-store-gateway}"
deck gateway sync "$REPO_ROOT/config/kong/kong.yaml" \
  --config "$HOME/.config/deck/.deck.yaml" \
  --konnect-control-plane-name "$cp_name"
log "deck gateway sync 完了: $cp_name"
```

- [ ] **Step 2: `up` / `down` タスクを実装**

`.mise/tasks/up`:

```bash
#!/usr/bin/env bash
#MISE description="コンテナを起動（compose up -d --build）"
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
docker compose up -d --build
```

`.mise/tasks/down`:

```bash
#!/usr/bin/env bash
#MISE description="コンテナを停止（compose down）"
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
docker compose down
```

- [ ] **Step 3: 構文チェック**

Run: `chmod +x .mise/tasks/gateway/sync .mise/tasks/up .mise/tasks/down && for t in .mise/tasks/gateway/sync .mise/tasks/up .mise/tasks/down; do bash -n "$t"; done && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 4: コミット**

```bash
git add .mise/tasks/gateway/sync .mise/tasks/up .mise/tasks/down
git commit -m "feat: gateway:sync / up / down タスクを追加"
```

---

## Task 9: `setup` オーケストレータと統合確認

**Files:**

- Create: `.mise/tasks/setup`

**Interfaces:**

- Consumes: `doctor`, `certs:gen`, `konnect:sync`, `env:patch`, `gateway:sync`, `up`
- Produces: 一括セットアップ

- [ ] **Step 1: `setup` タスクを実装**

```bash
#!/usr/bin/env bash
#MISE description="1コマンドセットアップ（Konnect同期→証明書→.env→Gateway→起動）"
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mise run doctor
mise run certs:gen
mise run konnect:sync
mise run env:patch
mise run gateway:sync
mise run up

printf '\n✅ セットアップ完了: http://localhost:3000\n'
```

- [ ] **Step 2: タスク一覧に全タスクが並ぶことを確認**

Run: `chmod +x .mise/tasks/setup && mise tasks | grep -E 'setup|doctor|certs:gen|konnect:sync|env:patch|gateway:sync|^up|^down|teardown|selftest'`
Expected: 各タスクが表示される

- [ ] **Step 3: ローカルテスト（Konnect 非依存）が緑であることを確認**

Run: `mise run selftest`
Expected: `ALL PASS`

- [ ] **Step 4: 【ユーザー環境】本番パスの統合確認**

> このステップは kongctl ログイン済みのユーザー環境で実行する。`.env` の `DECK_OPENAI_API_KEY` は事前に記入すること。

Run: `mise run setup`
Expected: `doctor` 全 OK → `kongctl sync` 完了 → `.env` に `PREFIX`/`EVENT_GATEWAY_CP_ID` が実値化 → `deck gateway sync` 完了 → `docker compose up` 完了 → `✅ セットアップ完了`

確認:

```bash
grep -E '^(PREFIX|EVENT_GATEWAY_CP_ID|DECK_KONNECT_CONTROL_PLANE_NAME)=' .env
docker compose ps
```

Expected: `PREFIX` がプレースホルダでない / 全コンテナが起動

> §11 の要検証項目（PREFIX/id の JSON フィールド名、`!file .certs` 解決、`kongctl plan` の成否）はここで確定する。想定と異なれば env:patch の jq 式・konnect:sync のステージ処理を修正して再コミット。

- [ ] **Step 5: verify-stack スモークテスト**

Run: verify-stack スキルを実行（ヘルスチェック / Kong プラグイン / Kafka フロー）
Expected: 主要サービスが 200、購入フローが `PENDING → CONFIRMED → SHIPPED`

- [ ] **Step 6: コミット**

```bash
git add .mise/tasks/setup
git commit -m "feat: 1コマンドセットアップの setup オーケストレータを追加"
```

---

## Task 10: `teardown` タスク（分離環境の後始末）

**Files:**

- Create: `.mise/tasks/teardown`

**Interfaces:**

- Consumes: `RESOURCE_PREFIX`（必須）
- Produces: compose down -v / 対象 namespace の Konnect リソース削除 / `.env` 分離値の復元

- [ ] **Step 1: `teardown` タスクを実装**

```bash
#!/usr/bin/env bash
#MISE description="E2E分離環境の後始末（RESOURCE_PREFIX 必須）"
set -euo pipefail
source "$(git rev-parse --show-toplevel)/.mise/lib/common.sh"

[ -n "${RESOURCE_PREFIX:-}" ] || die "teardown は RESOURCE_PREFIX を指定して実行してください（本番誤削除防止）"

cd "$REPO_ROOT"
docker compose down -v || true

ns="jungle-store-$RESOURCE_PREFIX"
# 対象 namespace のみを空設定で sync → 当該 namespace のリソースを全削除
empty="$(mktemp -d)"
printf '_defaults:\n  kongctl:\n    namespace: %s\n' "$ns" >"$empty/empty.yaml"
kongctl sync -f "$empty" --auto-approve
log "namespace 削除: $ns"

# .env の分離値を既定へ戻す
env_set DECK_KONNECT_CONTROL_PLANE_NAME "jungle-store-gateway"
log "teardown 完了"
```

- [ ] **Step 2: ガード動作を確認（RESOURCE_PREFIX 無しは拒否）**

Run: `chmod +x .mise/tasks/teardown && bash -n .mise/tasks/teardown && mise run teardown; echo "exit=$?"`
Expected: `RESOURCE_PREFIX を指定して...` で `exit=1`（非 0）

- [ ] **Step 3: 【ユーザー環境】分離ライフサイクル確認**

Run: `RESOURCE_PREFIX=e2e mise run setup` → `RESOURCE_PREFIX=e2e mise run teardown`
Expected: 接頭辞付きリソースが作成・起動し、その後に compose ボリューム削除 + `jungle-store-e2e` namespace のリソース削除。本番 `jungle-store` namespace のリソースは Konnect UI 上で不変。

> `kongctl sync` の空設定 namespace スコープ削除が想定どおり働くか（§11 要検証 #4）をここで確定。もし削除されない/エラーになる場合は `kongctl delete` 系コマンドへ差し替えて再コミット。

- [ ] **Step 4: コミット**

```bash
git add .mise/tasks/teardown
git commit -m "feat: 分離環境を後始末する teardown タスクを追加"
```

---

## Task 11: ドキュメント更新

**Files:**

- Modify: `README.md`（クイックスタート）
- Modify: `CLAUDE.md`（コマンド節）

**Interfaces:**

- Produces: 新フローの手順ドキュメント

- [ ] **Step 1: `README.md` のクイックスタートを更新**

`## クイックスタート` セクションの `docker compose up -d --build` の前に、`mise run setup` を第一手段として追記する。既存の個別手順（decK / kongctl）は「手動で行う場合」として残す。追記例:

```markdown
### 1コマンドセットアップ（推奨）

前提: `.env` に `DECK_OPENAI_API_KEY` を記入 / `kongctl login` 済み / deck トークン設定済み。

\`\`\`bash
mise run setup
\`\`\`

`doctor`（前提チェック）→ `certs:gen`（自己署名証明書）→ `konnect:sync`（Konnect 同期 + 証明書ピン留め）→ `env:patch`（.env に PREFIX/CP_ID/シークレットを反映）→ `gateway:sync`（deck）→ `up`（compose）を一括実行します。

分離起動（本番リソースと衝突させず E2E 検証）:

\`\`\`bash
RESOURCE_PREFIX=e2e mise run setup
RESOURCE_PREFIX=e2e mise run teardown # 後始末
\`\`\`
```

- [ ] **Step 2: `README.md` の前提条件を更新**

`## 前提条件` の証明書行を「自己署名証明書は `mise run certs:gen` で自動生成」に更新し、手動ピン留め手順の記述を削除（`## セットアップ` の「Kong Konnect 証明書」節も同様に簡素化）。

- [ ] **Step 3: `CLAUDE.md` のコマンド節に追記**

`### Kong / Konnect への設定反映` の直後に、`mise run setup`（1コマンドセットアップ）と各サブタスク（`doctor`/`certs:gen`/`konnect:sync`/`env:patch`/`gateway:sync`/`teardown`/`selftest`）の概説を追記。共有ライブラリは `.mise/lib/` にある旨も記載。

- [ ] **Step 4: 整合性確認**

Run: `npm run format:check || true`（Markdown が Prettier 準拠か。差分あれば `npm run format`）
Expected: エラーなし、または format 後にクリーン

- [ ] **Step 5: コミット**

```bash
git add README.md CLAUDE.md
git commit -m "docs: 1コマンドセットアップ手順を README/CLAUDE に反映"
```

---

## Self-Review メモ

- **Spec coverage:** §3 タスク一覧 → Task 1,2,5,6,7,8,9,10 / §4 フロー → Task 9 / §5 .env → Task 6 / §6 分離 → Task 4,5,6,10 / §7 証明書 → Task 2,3,5 / §8 doctor → Task 7 / §9 teardown → Task 10 / §10 既存資産・§11 要検証 → Task 9,10 で確定 / §12 検証 → selftest(Task1,4) + verify-stack(Task9)。カバー済み。
- **Placeholder scan:** 全ステップに実コードを記載。「ユーザー環境」ステップは外部依存の統合確認であり内容は具体化済み。
- **Type consistency:** `env_get`/`env_set` のシグネチャ、`render-kongctl.sh` の stdout 契約、命名接頭辞（namespace=`jungle-store-<p>`、名前=`...-<p>`）を全タスクで統一。
