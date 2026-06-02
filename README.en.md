# Konnect Entire Demo

[![CI](https://github.com/shukawam/konnect-entire-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/shukawam/konnect-entire-demo/actions/workflows/ci.yml)

[日本語](./README.md)

A microservice-based e-commerce site demo showcasing Kong Konnect features.
Built with gorilla-themed product data, it demonstrates API Gateway capabilities, AI Gateway, async event processing, and full observability.

## Architecture

![architecture](/images/architecture.png)

## Tech Stack

| Layer             | Technology                                                   |
| ----------------- | ------------------------------------------------------------ |
| Frontend          | Next.js 15, React 19, @vercel/otel, NextAuth (Auth.js v5)    |
| Backend           | Hono, @hono/zod-openapi, Prisma, KafkaJS                     |
| Auth (SSO)        | Keycloak (OpenID Connect IdP) + Kong `openid-connect` plugin |
| AI Agent          | @volcano.dev/agent, Kong AI Proxy + MCP Proxy                |
| API Gateway       | Kong Gateway 3.13 (Konnect hybrid mode)                      |
| Event Gateway     | Kong Event Gateway (Kafka proxy with ACL)                    |
| Database          | MySQL 8.0                                                    |
| Cache             | Redis 8.0 (vector DB for AI Prompt Guard)                    |
| Messaging         | Apache Kafka 3.7.0                                           |
| Observability     | otel-lgtm (Grafana, Tempo, Prometheus, Loki, OTel Collector) |
| Config Management | Deck (Kong declarative config sync)                          |
| Monorepo          | npm workspaces (`packages/*`, `services/*`)                  |

## Prerequisites

- Docker / Docker Compose
- Node.js 20+ (for local development)
- Kong Konnect account + cluster certificates (placed in `certs/`)

## Setup

### Environment Variables

```bash
cp .env.example .env
```

Open `.env` and configure the following values for your environment:

| Variable                          | Description                            | Example                                |
| --------------------------------- | -------------------------------------- | -------------------------------------- |
| `CONTROL_PLANE_ID`                | Konnect control plane ID               | `xxxxxxxx-xxxx-...`                    |
| `EVENT_GATEWAY_CP_ID`             | Konnect Event Gateway control plane ID | `xxxxxxxx-xxxx-...`                    |
| `DECK_KONNECT_CONTROL_PLANE_NAME` | Konnect control plane name             | `my-control-plane`                     |
| `DECK_OPENAI_API_KEY`             | OpenAI API key (for AI Gateway)        | `sk-...`                               |
| `AUTH_SECRET`                     | NextAuth session encryption key        | generate via `openssl rand -base64 32` |
| `AUTH_KEYCLOAK_ID`                | Keycloak client ID                     | `jungle-store-frontend`                |
| `AUTH_KEYCLOAK_SECRET`            | Keycloak client secret                 | (issued by Keycloak)                   |

Other variables (MySQL, Kafka, service URLs, Keycloak URLs/realm, etc.) work with their default values.

### Kong Konnect Certificates

Place your Konnect control plane cluster certificates in the `certs/` directory.

### Keycloak (end-user authentication)

End-user authentication uses Keycloak as an OpenID Connect IdP (SSO).
You create and **export the Keycloak realm (client + users) yourself**, then place it at
`config/keycloak/<realm>-realm.json` so it is auto-imported on startup.

1. Start Keycloak once with `docker compose up -d keycloak` and log in to `http://localhost:8081`
   (admin credentials from `.env`: `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`)
2. Create the `jungle-store` realm, a client for NextAuth, and demo users
   (see [`config/keycloak/README.md`](config/keycloak/README.md) for redirect URI requirements)
3. Set the client secret in `.env` as `AUTH_KEYCLOAK_SECRET`
4. Export the realm and save it as `config/keycloak/jungle-store-realm.json`
5. From then on, `docker compose up -d --build` auto-imports the realm

## Quick Start

```bash
# Start all services (first build takes a few minutes)
docker compose up -d --build

# Check status
docker compose ps

# Stop (data retained)
docker compose down

# Stop + delete volumes (full reset)
docker compose down -v
```

## Access Points

| Service      | URL                                                  | Purpose                       |
| ------------ | ---------------------------------------------------- | ----------------------------- |
| Frontend     | [http://localhost:3000](http://localhost:3000)       | E-commerce site UI            |
| Kong Gateway | [http://localhost:8000](http://localhost:8000)       | API entry point               |
| Konnect      | [https://cloud.konghq.com](https://cloud.konghq.com) | Control plane (SaaS)          |
| Grafana      | [http://localhost:3010](http://localhost:3010)       | Dashboard (no login required) |
| Kafka UI     | [http://localhost:8080](http://localhost:8080)       | Kafka topics & messages       |
| Keycloak     | [http://localhost:8081](http://localhost:8081)       | Auth IdP / admin console      |

Each backend service auto-serves OAS 3.1.0 at `/openapi.json` (e.g., [http://localhost:3001/openapi.json](http://localhost:3001/openapi.json)).

## Demo Users

Users are created and managed in the Keycloak realm (see [`config/keycloak/README.md`](config/keycloak/README.md)).
For example, creating the following users is convenient.

| Name                 | Email               | Password      |
| -------------------- | ------------------- | ------------- |
| ゴリラ太郎           | `user@example.com`  | `password123` |
| シルバーバック管理者 | `admin@example.com` | `password123` |

After login, the `sub` claim of the access token (JWT) is passed to each service as `X-User-Id`.

## Basic Flow

### From the browser

1. Open [http://localhost:3000](http://localhost:3000)
2. Click "Login" → redirected to Keycloak → sign in (SSO) with a demo user
3. Browse products, add to cart, and place an order
4. Watch order status change: `PENDING` → `CONFIRMED` → `SHIPPED`

### Using curl

Protected APIs require a Keycloak access token passed as `Authorization: Bearer`.
(Enable Direct Access Grants on the Keycloak client to fetch a token this way.)

```bash
# List products (no auth required)
curl http://localhost:8000/api/products

# Obtain an access token from Keycloak
TOKEN=$(curl -s -X POST \
  http://localhost:8081/realms/jungle-store/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=jungle-store-frontend" \
  -d "client_secret=${AUTH_KEYCLOAK_SECRET}" \
  -d "username=user@example.com" \
  -d "password=password123" | jq -r .access_token)

# Add item to cart (OIDC required; Kong injects X-User-Id from the token sub)
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"productId":"prod-001","quantity":2,"price":1980}'

# Place an order (triggers Kafka → auto shipment creation)
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}"
```

## Kong Konnect Feature Demos

### Kong Plugins

| Plugin                     | Scope                       | Description                                                   |
| -------------------------- | --------------------------- | ------------------------------------------------------------- |
| `cors`                     | Global                      | CORS header management                                        |
| `rate-limiting-advanced`   | Global                      | 60 req/min                                                    |
| `correlation-id`           | Global                      | Auto-assigns `X-Request-Id` header                            |
| `opentelemetry`            | Global                      | Sends traces, logs, and metrics to OTel Collector             |
| `openid-connect`           | Cart, Order, Shipping, User | Validates Keycloak JWT and injects claims as upstream headers |
| `rate-limiting`            | Order                       | 10 req/min (strict limit)                                     |
| `proxy-cache`              | Catalog                     | Caches GET responses for 30 seconds                           |
| `ai-semantic-prompt-guard` | AI Gateway                  | Input validation with allow/deny rules (Redis + Embeddings)   |
| `ai-prompt-decorator`      | AI Gateway                  | Auto-injects gorilla character system prompt                  |
| `ai-proxy-advanced`        | AI Gateway                  | LLM proxy to OpenAI GPT-4o-mini                               |
| `ai-mcp-proxy`             | MCP (3 routes)              | Model Context Protocol tool serving                           |

### OpenID Connect

```bash
# Without token → 401
curl -i http://localhost:8000/api/carts

# With Bearer token → 200 (${TOKEN} obtained as shown above)
curl -i http://localhost:8000/api/carts \
  -H "Authorization: Bearer ${TOKEN}"
```

Kong's `openid-connect` plugin validates the JWT and injects the `sub`/`email`/`preferred_username`
claims as the `X-User-Id`/`X-User-Email`/`X-User-Name` upstream headers.

### Rate Limiting

```bash
# Global: 60 req/min, Order Service: 10 req/min
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8000/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}"
done
```

### Proxy Cache

```bash
# First request: X-Cache-Status: Miss → Second request: X-Cache-Status: Hit (30s TTL)
curl -i http://localhost:8000/api/products
```

### Correlation ID

Every request automatically gets an `X-Request-Id` header.

## AI Gateway / AI Agent

The Agent Service (port 3006) is an AI chatbot powered by Kong AI Gateway and MCP Proxy.

### How it works

1. **AI Proxy Advanced** — Provides an LLM gateway to OpenAI GPT-4o-mini via the `/ai/v1` route
2. **AI Prompt Decorator** — Auto-injects the gorilla character system prompt into requests
3. **AI Semantic Prompt Guard** — Blocks inappropriate inputs using Redis vector DB + OpenAI Embeddings
4. **AI MCP Proxy** — Provides product search, cart operations, and order history as MCP tools to the LLM

### MCP Routes

| Route           | Target Service | Tool                                |
| --------------- | -------------- | ----------------------------------- |
| `/mcp/products` | Catalog        | `list-products` — List all products |
| `/mcp/carts`    | Cart           | `get-cart` — Get cart contents      |
| `/mcp/orders`   | Order          | `list-orders` — Get order history   |

### Trying the AI Chat

Use the AI chat dialog in the bottom-right corner of the frontend to talk to the gorilla assistant. You can search products, check your cart, and review order history using natural language.

## Async Event Processing (Kafka + Event Gateway)

The order-to-shipment flow is handled asynchronously via Kafka. **Kong Event Gateway** acts as a Kafka proxy, enforcing topic-level ACLs per service.

### Topic ACL

| Service                       | Write                  | Read                   |
| ----------------------------- | ---------------------- | ---------------------- |
| Order Service (port 19092)    | `order.created`        | `order.status-updated` |
| Shipping Service (port 19093) | `order.status-updated` | `order.created`        |

### Event Flow

1. Order Service publishes `order.created` via Event Gateway (19092)
2. Shipping Service consumes it via Event Gateway (19093), creates a shipment → `CONFIRMED`
3. After 5 seconds, updates status to `SHIPPED`
4. Publishes `order.status-updated` → Order Service reflects the new status

Monitor message flow via Kafka UI at http://localhost:8080.

## Observability

All services send telemetry via [otel-lgtm](https://github.com/grafana/docker-otel-lgtm) (OTel Collector + Tempo + Prometheus + Loki + Grafana bundled in a single container). Kong Gateway itself also sends traces, logs, and metrics via the `opentelemetry` plugin. The bundled Collector config is overridden at `config/observability/otel-lgtm/otelcol-config.yaml`, preserving the noise-reduction filter and the Kong AI metrics scrape.

### Viewing Traces

1. [Grafana](http://localhost:3010) → Explore → Select **Tempo**
2. Search by Service Name
3. View spans: Kong → backend service → MySQL

### Viewing Logs

1. Grafana → Explore → Select **Loki**
2. Filter by `service_name`
3. Click TraceID links to jump to Tempo

## Konnect Configuration Management (kongctl)

The `kongctl/` directory contains declarative configuration for Konnect resources.

| File                  | Contents                                                        |
| --------------------- | --------------------------------------------------------------- |
| `apis.yaml`           | 6 API definitions (Catalog, Cart, Order, Shipping, User, Agent) |
| `control-planes.yaml` | Control plane configuration                                     |
| `event-gateways.yaml` | Event Gateway + topic ACL configuration                         |
| `portals.yaml`        | Developer portal configuration                                  |
| `portal-teams.yaml`   | Portal team configuration                                       |
| `portals/`            | OAS specs, API documentation, guide pages                       |

## API Reference

See the `guides/` directory for detailed API references for each service.

- [Getting Started](guides/getting-started.md)
- [Catalog API](guides/catalog-api.md)
- [Cart API](guides/cart-api.md)
- [Order API](guides/order-api.md)
- [Shipping API](guides/shipping-api.md)
- [User API](guides/user-api.md)
- [Agent API](guides/agent-api.md)

## Project Structure

```
├── packages/
│   └── shared/              # Shared types (Product, Cart, Order, etc.), Kafka constants
├── services/
│   ├── catalog-service/     # Product API (port 3001)
│   ├── cart-service/        # Cart API (port 3002)
│   ├── order-service/       # Order API + Kafka producer/consumer (port 3003)
│   ├── shipping-service/    # Shipping API + Kafka producer/consumer (port 3004)
│   ├── user-service/        # User API (port 3005)
│   ├── agent-service/       # AI chat agent (port 3006)
│   └── frontend/            # Next.js frontend (port 3000)
├── config/
│   ├── kong/                # Kong Gateway declarative config
│   ├── mysql/               # DB initialization SQL
│   └── observability/       # otel-lgtm (bundled OTel Collector) config
├── kongctl/                 # Konnect resource configuration management
├── guides/                  # API reference guides
└── certs/                   # Kong cluster certificates
```

## Local Development

To run individual services outside Docker Compose:

```bash
# Start a single service
npm run dev:catalog    # port 3001
npm run dev:cart       # port 3002
npm run dev:order      # port 3003
npm run dev:shipping   # port 3004
npm run dev:user       # port 3005
npm run dev:agent      # port 3006
npm run dev:frontend   # port 3000

# Database operations (all services)
npm run db:generate    # Generate Prisma clients
npm run db:push        # Push schemas
npm run db:seed        # Seed demo data

# Code formatting
npm run format         # Format with Prettier
npm run format:check   # Check formatting

# Testing
npm run test           # Run all service tests
npm run test:coverage  # Run tests with coverage
```

### Docker Compose Watch (hot reload)

Auto-sync source code changes during development:

```bash
docker compose watch
```

Changes under each service's `src/` are auto-synced to containers. Changes to `package.json` or `prisma/schema.prisma` trigger an automatic rebuild.

## Troubleshooting

### Service fails to start

```bash
docker compose ps
docker compose logs <service-name>
```

### MySQL / Kafka connection errors

These services can take time to start. Dependent services wait for healthchecks to pass.

### Clear cached builds

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```
