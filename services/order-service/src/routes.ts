import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Order, OrderItem } from '../generated/prisma'
import { context, propagation } from '@opentelemetry/api'
import type { Context } from 'hono'
import { createLogger } from '@konnect-demo/shared'
import { prisma } from './db.js'
import { producer } from './kafka.js'

function serializeOrder(order: Order & { items: OrderItem[] }) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

const log = createLogger('order-service')

const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3002'
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3001'

// ---------- Schemas ----------

const OrderItemSchema = z
  .object({
    id: z.string().openapi({ example: 'item-1' }),
    orderId: z.string().openapi({ example: 'order-1' }),
    productId: z.string().openapi({ example: 'prod-1' }),
    quantity: z.number().int().openapi({ example: 2 }),
    price: z.number().openapi({ example: 1500 }),
  })
  .openapi('OrderItem')

const OrderSchema = z
  .object({
    id: z.string().openapi({ example: 'order-1' }),
    userId: z.string().openapi({ example: 'user-1' }),
    status: z.string().openapi({ example: 'PENDING' }),
    totalPrice: z.number().openapi({ example: 3000 }),
    items: z.array(OrderItemSchema),
    createdAt: z.string().openapi({ example: '2026-01-01T00:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-01-01T00:00:00.000Z' }),
  })
  .openapi('Order')

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'Unauthorized' }),
  })
  .openapi('Error')

// ---------- Route definitions ----------

const listOrdersRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Order'],
  summary: '注文一覧取得',
  request: {
    headers: z.object({
      'x-user-id': z.string().openapi({ description: 'ユーザーID', example: 'user-1' }),
    }),
  },
  responses: {
    200: {
      description: '注文一覧',
      content: { 'application/json': { schema: z.array(OrderSchema) } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

const getOrderRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Order'],
  summary: '注文詳細取得',
  request: {
    params: z.object({ id: z.string().openapi({ description: '注文ID', example: 'order-1' }) }),
    headers: z.object({
      'x-user-id': z.string().openapi({ description: 'ユーザーID', example: 'user-1' }),
    }),
  },
  responses: {
    200: {
      description: '注文詳細',
      content: { 'application/json': { schema: OrderSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    404: {
      description: 'Not Found',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

const createOrderRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Order'],
  summary: '注文作成',
  description: 'カートの内容から注文を作成し、Kafkaにイベントを発行後、カートをクリアする',
  request: {
    headers: z.object({
      'x-user-id': z.string().openapi({ description: 'ユーザーID', example: 'user-1' }),
    }),
  },
  responses: {
    201: {
      description: '注文作成成功',
      content: { 'application/json': { schema: OrderSchema } },
    },
    400: {
      description: 'Bad Request (cart is empty)',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    502: {
      description: 'Bad Gateway (failed to fetch cart)',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

// ---------- App & handlers ----------

const app = new OpenAPIHono()

/** Extract userId from X-User-Id header; 401 if missing */
function getUserId(c: Context): string | null {
  const userId = c.req.header('X-User-Id')
  if (!userId) return null
  return userId
}

// List orders for user
app.openapi(listOrdersRoute, async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })

  return c.json(orders.map(serializeOrder), 200)
})

// Get order by ID
app.openapi(getOrderRoute, async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const order = await prisma.order.findUnique({
    where: { id: c.req.valid('param').id },
    include: { items: true },
  })

  if (!order) return c.json({ error: 'Order not found' }, 404)
  if (order.userId !== userId) return c.json({ error: 'Forbidden' }, 403)

  return c.json(serializeOrder(order), 200)
})

// Create order from cart
app.openapi(createOrderRoute, async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  // 1. Fetch cart from Cart Service
  let cartRes: Response
  try {
    cartRes = await fetch(`${CART_SERVICE_URL}/api/carts`, {
      headers: { 'X-User-Id': userId },
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    log.error({ err, userId }, 'Failed to fetch cart')
    return c.json({ error: 'Failed to fetch cart' }, 502)
  }

  if (!cartRes.ok) {
    return c.json({ error: 'Failed to fetch cart' }, 502)
  }

  let cart: { items: { productId: string; quantity: number; price: number }[] }
  try {
    cart = await cartRes.json()
  } catch (err) {
    log.error({ err, userId }, 'Failed to parse cart response')
    return c.json({ error: 'Failed to fetch cart' }, 502)
  }

  // 2. Check cart is not empty
  if (!cart.items || cart.items.length === 0) {
    return c.json({ error: 'Cart is empty' }, 400)
  }

  // 3. Stock validation
  for (const item of cart.items) {
    try {
      const productRes = await fetch(`${CATALOG_SERVICE_URL}/api/products/${item.productId}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (productRes.ok) {
        const product = (await productRes.json()) as { name: string; stock: number }
        if (item.quantity > product.stock) {
          return c.json({ error: `在庫不足: ${product.name} (残り${product.stock}個)` }, 400)
        }
      }
    } catch (err) {
      log.warn({ err, productId: item.productId }, 'Failed to check stock, skipping')
    }
  }

  // 4. Create order with items
  const totalPrice = cart.items.reduce(
    (sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity,
    0,
  )

  const order = await prisma.order.create({
    data: {
      userId,
      totalPrice,
      items: {
        create: cart.items.map((item: { productId: string; quantity: number; price: number }) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
      },
    },
    include: { items: true },
  })

  // 5. Publish order.created event (inject trace context into Kafka headers)
  try {
    const headers: Record<string, string> = {}
    propagation.inject(context.active(), headers)

    log.info({ traceHeaders: headers }, 'Injected trace context into Kafka headers')

    await producer.send({
      topic: 'order.created',
      messages: [
        {
          key: order.id,
          value: JSON.stringify({
            orderId: order.id,
            userId: order.userId,
            items: order.items,
            totalPrice: order.totalPrice,
            createdAt: order.createdAt,
          }),
          headers,
        },
      ],
    })
    log.info({ orderId: order.id }, 'Published order.created event')
  } catch (err) {
    log.error({ err, orderId: order.id }, 'Failed to publish order.created event')
  }

  // 6. Clear cart
  try {
    await fetch(`${CART_SERVICE_URL}/api/carts`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    log.error({ err, userId }, 'Failed to clear cart')
  }

  // 7. Return created order
  return c.json(serializeOrder(order), 201)
})

export default app
