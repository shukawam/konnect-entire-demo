FROM node:20-slim AS base
WORKDIR /app

COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/frontend/package.json ./services/frontend/
COPY services/catalog-service/package.json ./services/catalog-service/
COPY services/cart-service/package.json ./services/cart-service/
COPY services/order-service/package.json ./services/order-service/
COPY services/shipping-service/package.json ./services/shipping-service/
COPY services/user-service/package.json ./services/user-service/
COPY services/agent-service/package.json ./services/agent-service/

RUN npm install --workspace=services/frontend --ignore-scripts

COPY packages/shared/ ./packages/shared/
COPY services/frontend/ ./services/frontend/

WORKDIR /app/services/frontend
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
