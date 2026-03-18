# Konnect Entire Demo

[![CI](https://github.com/shukawam/konnect-entire-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/shukawam/konnect-entire-demo/actions/workflows/ci.yml)

[日本語](./README.md)

A microservice-based e-commerce site demo showcasing Kong Konnect features.
Built with gorilla-themed product data, it demonstrates API Gateway capabilities, AI Gateway, async event processing, and full observability.

## Architecture

![architecture](/images/architecture.png)

## Tech Stack

| Layer            | Technology                                       |
| ---------------- | ------------------------------------------------ |
| Frontend         | Next.js 15, React 19, @vercel/otel               |
| Backend          | Hono, @hono/zod-openapi, Prisma, KafkaJS         |
| AI Agent         | @volcano.dev/agent, Kong AI Proxy + MCP Proxy     |
| API Gateway      | Kong Gateway 3.13 (Konnect hybrid mode)          |
| Event Gateway    | Kong Event Gateway (Kafka proxy with ACL)        |
| Database         | MySQL 8.0                                        |
| Cache            | Redis 8.0 (vector DB for AI Prompt Guard)        |
| Messaging        | Apache Kafka 3.7.0                               |
| Observability    | Grafana, Tempo, Prometheus, Loki, OTel Collector |
| Config Management| Deck (Kong declarative config sync)              |
| Monorepo         | npm workspaces (`packages/*`, `services/*`)      |

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

| Variable | Description | Example |
| --- | --- | --- |
| `CONTROL_PLANE_ID` | Konnect control plane ID | `xxxxxxxx-xxxx-...` |
| `EVENT_GATEWAY_CP_ID` | Konnect Event Gateway control plane ID | `xxxxxxxx-xxxx-...` |
| `DECK_KONNECT_CONTROL_PLANE_NAME` | Konnect control plane name | `my-control-plane` |
| `DECK_OPENAI_API_KEY` | OpenAI API key (for AI Gateway) | `sk-...` |

Other variables (MySQL, Kafka, service URLs, etc.) work with their default values.

### Kong Konnect Certificates

Place your Konnect control plane cluster certificates in the `certs/` directory.

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

Each backend service auto-serves OAS 3.1.0 at `/openapi.json` (e.g., [http://localhost:3001/openapi.json](http://localhost:3001/openapi.json)).

## Demo Users

The following users are automatically created on startup.

| Name                 | Email               | Password      | API Key         |
| -------------------- | ------------------- | ------------- | --------------- |
| ゴリラ太郎           | `user@example.com`  | `password123` | `demo-api-key`  |
| シルバーバック管理者 | `admin@example.com` | `password123` | `admin-api-key` |

## Basic Flow

### From the browser

1. Open [http://localhost:3000](http://localhost:3000)
2. Log in with `user@example.com` / `password123`
3. Browse products, add to cart, and place an order
4. Watch order status change: `PENDING` → `CONFIRMED` → `SHIPPED`

### Using curl

```bash
# List products (no auth required)
curl http://localhost:8000/api/products

# Log in
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Add item to cart (API key required)
curl -X POST http://localhost:8000/api/carts/items \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001" \
  -d '{"productId":"prod-001","quantity":2,"price":1980}'

# Place an order (triggers Kafka → auto shipment creation)
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

## Kong Konnect Feature Demos

### Kong Plugins

| Plugin | Scope | Description |
| --- | --- | --- |
| `cors` | Global | CORS header management |
| `rate-limiting-advanced` | Global | 60 req/min |
| `correlation-id` | Global | Auto-assigns `X-Request-Id` header |
| `opentelemetry` | Global | Sends traces, logs, and metrics to OTel Collector |
| `key-auth` | Cart, Order, Shipping | API key authentication |
| `rate-limiting` | Order | 10 req/min (strict limit) |
| `proxy-cache` | Catalog | Caches GET responses for 30 seconds |
| `ai-semantic-prompt-guard` | AI Gateway | Input validation with allow/deny rules (Redis + Embeddings) |
| `ai-prompt-decorator` | AI Gateway | Auto-injects gorilla character system prompt |
| `ai-proxy-advanced` | AI Gateway | LLM proxy to OpenAI GPT-4o-mini |
| `ai-mcp-proxy` | MCP (3 routes) | Model Context Protocol tool serving |

### Key-Auth

```bash
# Without API key → 401
curl -i http://localhost:8000/api/carts

# With API key → 200
curl -i http://localhost:8000/api/carts \
  -H "apikey: demo-api-key" \
  -H "X-User-Id: user-001"
```

### Rate Limiting

```bash
# Global: 60 req/min, Order Service: 10 req/min
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8000/api/orders \
    -H "Content-Type: application/json" \
    -H "apikey: demo-api-key" \
    -H "X-User-Id: user-001"
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

| Route | Target Service | Tool |
| --- | --- | --- |
| `/mcp/products` | Catalog | `list-products` — List all products |
| `/mcp/carts` | Cart | `get-cart` — Get cart contents |
| `/mcp/orders` | Order | `list-orders` — Get order history |

### Trying the AI Chat

Use the AI chat dialog in the bottom-right corner of the frontend to talk to the gorilla assistant. You can search products, check your cart, and review order history using natural language.

## Async Event Processing (Kafka + Event Gateway)

The order-to-shipment flow is handled asynchronously via Kafka. **Kong Event Gateway** acts as a Kafka proxy, enforcing topic-level ACLs per service.

### Topic ACL

| Service | Write | Read |
| --- | --- | --- |
| Order Service (port 19092) | `order.created` | `order.status-updated` |
| Shipping Service (port 19093) | `order.status-updated` | `order.created` |

### Event Flow

1. Order Service publishes `order.created` via Event Gateway (19092)
2. Shipping Service consumes it via Event Gateway (19093), creates a shipment → `CONFIRMED`
3. After 5 seconds, updates status to `SHIPPED`
4. Publishes `order.status-updated` → Order Service reflects the new status

Monitor message flow via Kafka UI at http://localhost:8080.

## Observability

All services send telemetry via OTel Collector to Tempo (traces), Prometheus (metrics), and Loki (logs). Kong Gateway itself also sends traces, logs, and metrics via the `opentelemetry` plugin.

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

| File | Contents |
| --- | --- |
| `apis.yaml` | 6 API definitions (Catalog, Cart, Order, Shipping, User, Agent) |
| `control-planes.yaml` | Control plane configuration |
| `event-gateways.yaml` | Event Gateway + topic ACL configuration |
| `portals.yaml` | Developer portal configuration |
| `portal-teams.yaml` | Portal team configuration |
| `portals/` | OAS specs, API documentation, guide pages |

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
│   └── observability/       # Grafana, Tempo, Prometheus, Loki, OTel Collector config
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
