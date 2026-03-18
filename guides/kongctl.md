# kongctl - Konnect 設定管理

`kongctl` は Kong Konnect のリソースをコードで宣言的に管理する CLI ツールです。
このプロジェクトでは `kongctl/` ディレクトリに設定ファイルを配置し、`kongctl sync konnect` で Konnect 環境に反映します。

---

## ディレクトリ構成

```sh
kongctl/
├── control-planes.yaml          # コントロールプレーン定義
├── event-gateways.yaml          # Event Gateway 定義（→ event-gateway.md で詳説）
├── apis.yaml                    # API Product 定義（各サービスの OAS を参照）
├── portals.yaml                 # Dev Portal 定義（ページ、スニペット）
├── portal-teams.yaml            # Portal チーム・ロール定義
└── portals/
    ├── apis/                    # サービスごとの OpenAPI 仕様
    │   ├── catalog/openapi.yaml
    │   ├── cart/openapi.yaml
    │   ├── order/openapi.yaml
    │   ├── shipping/openapi.yaml
    │   ├── user/openapi.yaml
    │   └── agent/openapi.yaml
    ├── docs/                    # API ドキュメント（日本語）
    │   ├── catalog_ja.md
    │   ├── cart_ja.md
    │   └── ...
    ├── pages/                   # Portal ページコンテンツ
    │   ├── home.md
    │   ├── apis.md
    │   └── guides/
    └── snippets/                # Portal スニペット（サイドバー、フッター等）
```

---

## 設定ファイルの概要

### control-planes.yaml

Kong Gateway のコントロールプレーンを定義します。

```yaml
control_planes:
  - ref: jungle-store-gateway
    name: jungle-store-gateway
    description: Kong Gateway for Jungle Store.
    auth_type: pki_client_certs
    cluster_type: CLUSTER_TYPE_CONTROL_PLANE
```

- `auth_type: pki_client_certs` — Data Plane との接続にクライアント証明書を使用
- 証明書は `certs/` ディレクトリに配置

### apis.yaml

各マイクロサービスの API Product を定義します。OpenAPI 仕様とドキュメントを `!file` ディレクティブで参照し、Dev Portal への公開設定も含みます。

```yaml
apis:
  - ref: catalog-api
    name: !file portals/apis/catalog/openapi.yaml#info.title
    description: !file portals/apis/catalog/openapi.yaml#info.description
    versions:
      - ref: catalog-api-v1
        spec: !file portals/apis/catalog/openapi.yaml
    publications:
      - portal_id: !ref jungle-store-dev-portal#id
        visibility: private
```

ポイント:
- `!file` で OpenAPI YAML から `name` / `description` / `version` を動的に取得
- `!ref` で他リソース（Portal 等）の ID を参照
- `attributes` で検索・フィルタ用のタグを付与（`tier: free` / `premium`）

### portals.yaml

Dev Portal の構成（ページ、スニペット、認証設定）を定義します。

### portal-teams.yaml

Portal のチームとロールベースのアクセス制御を定義します。各 API に対する `API Viewer` ロールを持つチームを作成しています。

---

## 設定の反映

```bash
cd kongctl
kongctl sync konnect
```

すべての YAML ファイルが読み込まれ、Konnect 環境に差分が反映されます。

### 注意事項

- `_defaults.kongctl.namespace` で全ファイル共通の名前空間（`jungle-store`）を設定しています
- Konnect の認証情報（PAT 等）は事前に `kongctl` CLI に設定しておく必要があります
- 設定変更後は必ず `kongctl sync konnect` を実行して反映してください
