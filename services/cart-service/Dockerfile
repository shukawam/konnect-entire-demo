FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/cart-service/package.json ./services/cart-service/
COPY services/catalog-service/package.json ./services/catalog-service/
COPY services/order-service/package.json ./services/order-service/
COPY services/shipping-service/package.json ./services/shipping-service/
COPY services/user-service/package.json ./services/user-service/
COPY services/agent-service/package.json ./services/agent-service/
COPY services/frontend/package.json ./services/frontend/
RUN npm install --workspace=services/cart-service --workspace=packages/shared
COPY packages/shared/ ./packages/shared/
COPY services/cart-service/ ./services/cart-service/
RUN npx prisma generate --schema=services/cart-service/prisma/schema.prisma
WORKDIR /app/services/cart-service
RUN npx tsc
EXPOSE 3002
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
