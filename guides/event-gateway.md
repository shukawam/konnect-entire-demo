# Event Gateway - Kafka プロキシと ACL 制御

Kong Event Gateway は Kafka クラスタの前段に配置されるプロキシで、サービスごとにトピックレベルの ACL（アクセス制御）を強制します。

---

## 概要

```sh
Order Service ──:19092──> Event Gateway ──:9092──> Kafka
Shipping Service ──:19093──> Event Gateway ──:9092──> Kafka
```

各サービスは Kafka に直接接続せず、Event Gateway 経由でアクセスします。
Event Gateway は Virtual Cluster ごとに ACL ポリシーを適用し、許可されたトピック・操作のみを通します。

---

## アーキテクチャ

### バックエンドクラスタ

実際の Kafka クラスタへの接続情報を定義します。

```yaml
backend_clusters:
  - ref: jungle-store-kafka
    name: jungle-store-kafka
    bootstrap_servers:
      - 'kafka:9092'
    authentication:
      type: anonymous
```

### Virtual Cluster

サービスごとに独立した仮想クラスタを作成し、ACL でアクセス範囲を制限します。

| Virtual Cluster       | サービス         | Write 許可トピック     | Read 許可トピック      |
| --------------------- | ---------------- | ---------------------- | ---------------------- |
| `order-service-vc`    | Order Service    | `order.created`        | `order.status-updated` |
| `shipping-service-vc` | Shipping Service | `order.status-updated` | `order.created`        |

両方とも、許可されていないトピックへのアクセスはデフォルト deny ルールでブロックされます。

### Listener

各 Virtual Cluster にポートを割り当て、サービスからの接続を受け付けます。

| Listener                    | ポート       | 転送先 Virtual Cluster |
| --------------------------- | ------------ | ---------------------- |
| `order-service-listener`    | 19091, 19092 | `order-service-vc`     |
| `shipping-service-listener` | 19093, 19094 | `shipping-service-vc`  |

- 各リスナーは 2 ポート使用（bootstrap + broker）
- `advertised_host: "event-gateway"` で Docker ネットワーク内のホスト名を広告

---

## ACL ポリシーの詳細

### Order Service（`order-service-acl`）

```yaml
rules:
  # order.created への write を許可
  - action: allow
    resource_type: topic
    operations: [write, describe]
    resource_names: ['order.created']

  # order.status-updated の read を許可
  - action: allow
    resource_type: topic
    operations: [read, describe]
    resource_names: ['order.status-updated']

  # コンシューマーグループの使用を許可
  - action: allow
    resource_type: group
    operations: [read]
    resource_names: ['order-service-group']

  # それ以外のトピックはすべて拒否
  - action: deny
    resource_type: topic
    operations: [write, read, describe]
    resource_names: ['*']
```

### Shipping Service（`shipping-service-acl`）

Order Service と逆方向のアクセス権を持ちます:

- `order.created` の **read** を許可
- `order.status-updated` の **write** を許可
- `shipping-service-group` コンシューマーグループの使用を許可
- その他はすべて拒否

---

## Docker Compose での設定

`compose.yaml` では、各サービスの `KAFKA_BROKER` を Event Gateway のリスナーポートに向けています。

```yaml
# Order Service → Event Gateway の Order 用リスナー
order-service:
  environment:
    KAFKA_BROKER: event-gateway:19091

# Shipping Service → Event Gateway の Shipping 用リスナー
shipping-service:
  environment:
    KAFKA_BROKER: event-gateway:19093
```

Event Gateway 自体は以下のように設定されています:

```yaml
event-gateway:
  image: kong/kong-event-gateway:latest
  environment:
    KONNECT_REGION: us
    KONNECT_DOMAIN: konghq.com
    KONNECT_GATEWAY_CLUSTER_ID: ${EVENT_GATEWAY_CP_ID:-}
  ports:
    - 19091:19091
    - 19092:19092
    - 19093:19093
    - 19094:19094
  volumes:
    - ./certs/event-gateway:/etc/kong/cluster-certs
```

---

## 環境変数

`.env` で Event Gateway のコントロールプレーン ID を設定します。

```
EVENT_GATEWAY_CP_ID=<your-event-gateway-cp-id>
```

---

## Konnect への設定反映

Event Gateway の設定は `kongctl/event-gateways.yaml` で管理されています。
変更後は以下のコマンドで Konnect に反映します。

```bash
cd kongctl
kongctl sync konnect
```

---

## トラブルシューティング

### Event Gateway に接続できない

```bash
# Event Gateway のログを確認
docker compose logs event-gateway

# リスナーポートが開いているか確認
docker compose exec event-gateway netstat -tlnp
```

### ACL で拒否される

Event Gateway のログに拒否されたリクエストが記録されます。`event-gateways.yaml` の ACL ルールを確認してください。

### Konnect との接続に失敗する

- `EVENT_GATEWAY_CP_ID` が正しく設定されているか確認
- `certs/event-gateway/` にクラスタ証明書が配置されているか確認
