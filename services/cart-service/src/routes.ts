import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Cart, CartItem } from '../generated/prisma'
import type { Context } from 'hono'
import { prisma } from './db.js'

function serializeCart(cart: Cart & { items: CartItem[] }) {
  return {
    ...cart,
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  }
}

const app = new OpenAPIHono()

// Schemas
const CartItemSchema = z
  .object({
    id: z.string().openapi({ example: 'item-001' }),
    cartId: z.string().openapi({ example: 'cart-001' }),
    productId: z.string().openapi({ example: 'prod-001' }),
    quantity: z.number().int().openapi({ example: 2 }),
    price: z.number().int().openapi({ example: 2980 }),
  })
  .openapi('CartItem')

const CartSchema = z
  .object({
    id: z.string().openapi({ example: 'cart-001' }),
    userId: z.string().openapi({ example: 'user-001' }),
    items: z.array(CartItemSchema),
    createdAt: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
  })
  .openapi('Cart')

const AddItemSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    price: z.number().int(),
  })
  .openapi('AddItem')

// ai-mcp-proxy 経由のツール呼び出し用フォールバック。JSON body の代わりにクエリで受け取る
// （decK が ai-mcp-proxy の request_body を Konnect へ送れないため。詳細は config/kong/kong.yaml）。
// 通常の API 呼び出し（body あり）の挙動は変えないため、全項目 optional にして
// 「body が無いときだけ」ハンドラ側で必須チェックする。
const AddItemQuerySchema = z
  .object({
    productId: z.string().min(1).optional().openapi({ example: 'prod-001' }),
    quantity: z.coerce.number().int().positive().optional().openapi({ example: 2 }),
    price: z.coerce.number().int().optional().openapi({ example: 2980 }),
  })
  .openapi('AddItemQuery')

const UpdateQuantitySchema = z
  .object({
    quantity: z.number().int(),
  })
  .openapi('UpdateQuantity')

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi('Error')

const MessageSchema = z
  .object({
    message: z.string(),
  })
  .openapi('Message')

// Helper: extract userId from X-User-Id header
function getUserId(c: Context): string | null {
  return c.req.header('X-User-Id') || null
}

// Routes

// GET / — カート取得（存在しなければ自動作成）
const getCart = createRoute({
  method: 'get',
  path: '/',
  tags: ['Cart'],
  summary: 'カート取得',
  description: 'ユーザーのカートを取得します。カートが存在しない場合は自動的に作成されます。',
  request: {
    headers: z.object({
      'x-user-id': z.string().openapi({ example: 'user-001' }),
    }),
  },
  responses: {
    200: {
      description: 'カート情報',
      content: { 'application/json': { schema: CartSchema } },
    },
    401: {
      description: '認証エラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    500: {
      description: 'サーバーエラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(getCart, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'X-User-Id header is required' }, 401)
  }

  let cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: true },
  })

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
      include: { items: true },
    })
  }

  return c.json(serializeCart(cart), 200)
})

// POST /items — 商品追加（upsert）
const addItem = createRoute({
  method: 'post',
  path: '/items',
  tags: ['Cart'],
  summary: '商品追加',
  description:
    'カートに商品を追加します。既に同じ商品がある場合は数量が加算されます。' +
    'JSON body が無い場合は同名のクエリパラメータ（productId / quantity / price）で受け付けます。',
  request: {
    headers: z.object({
      'x-user-id': z.string().openapi({ example: 'user-001' }),
    }),
    query: AddItemQuerySchema,
    body: { content: { 'application/json': { schema: AddItemSchema } }, required: false },
  },
  responses: {
    201: {
      description: '更新されたカート',
      content: { 'application/json': { schema: CartSchema } },
    },
    400: {
      description: 'パラメータ不正（body / クエリのいずれにも必要な項目が無い）',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: '認証エラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    500: {
      description: 'サーバーエラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(addItem, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'X-User-Id header is required' }, 401)
  }

  // body が無い（MCP ツール経由など）場合のみクエリパラメータを使う
  // body 未指定時は {} が渡るため、中身の有無で判定する
  const body = c.req.valid('json') as Partial<z.infer<typeof AddItemSchema>> | undefined
  const query = c.req.valid('query')
  const input = body && Object.keys(body).length > 0 ? body : query
  if (!input?.productId || input.quantity === undefined || input.price === undefined) {
    return c.json({ error: 'productId, quantity and price are required' }, 400)
  }
  const { productId, quantity, price } = input

  // Ensure cart exists
  let cart = await prisma.cart.findUnique({ where: { userId } })
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId } })
  }

  // Upsert: if item exists, increment quantity; otherwise create
  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  })

  if (existingItem) {
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: existingItem.quantity + quantity, price },
    })
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, quantity, price },
    })
  }

  const updatedCart = await prisma.cart.findUnique({
    where: { id: cart.id },
    include: { items: true },
  })

  if (!updatedCart) {
    return c.json({ error: 'Failed to retrieve cart' }, 500)
  }

  return c.json(serializeCart(updatedCart), 201)
})

// PATCH /items/{itemId} — 数量変更（0以下なら削除）
const updateItemQuantity = createRoute({
  method: 'patch',
  path: '/items/{itemId}',
  tags: ['Cart'],
  summary: '数量変更',
  description: 'カート内の商品の数量を変更します。数量が0以下の場合は商品を削除します。',
  request: {
    headers: z.object({
      'x-user-id': z.string().openapi({ example: 'user-001' }),
    }),
    params: z.object({
      itemId: z.string().openapi({ example: 'item-001' }),
    }),
    body: { content: { 'application/json': { schema: UpdateQuantitySchema } } },
  },
  responses: {
    200: {
      description: '更新された商品またはメッセージ',
      content: { 'application/json': { schema: z.union([CartItemSchema, MessageSchema]) } },
    },
    401: {
      description: '認証エラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    404: {
      description: '商品が見つかりません',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    500: {
      description: 'サーバーエラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(updateItemQuantity, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'X-User-Id header is required' }, 401)
  }

  const { itemId } = c.req.valid('param')
  const { quantity } = c.req.valid('json')

  const existingItem = await prisma.cartItem.findUnique({
    where: { id: itemId },
  })

  if (!existingItem) {
    return c.json({ error: 'Item not found' }, 404)
  }

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: itemId } })
    return c.json({ message: 'Item removed from cart' }, 200)
  }

  const item = await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  })

  return c.json(item, 200)
})

// DELETE /items/{itemId} — 商品削除
const deleteItem = createRoute({
  method: 'delete',
  path: '/items/{itemId}',
  tags: ['Cart'],
  summary: '商品削除',
  description: 'カートから商品を削除します。',
  request: {
    headers: z.object({
      'x-user-id': z.string().openapi({ example: 'user-001' }),
    }),
    params: z.object({
      itemId: z.string().openapi({ example: 'item-001' }),
    }),
  },
  responses: {
    200: {
      description: '削除完了',
      content: { 'application/json': { schema: MessageSchema } },
    },
    401: {
      description: '認証エラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    404: {
      description: '商品が見つかりません',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    500: {
      description: 'サーバーエラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(deleteItem, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'X-User-Id header is required' }, 401)
  }

  const { itemId } = c.req.valid('param')

  const existingItem = await prisma.cartItem.findUnique({
    where: { id: itemId },
  })

  if (!existingItem) {
    return c.json({ error: 'Item not found' }, 404)
  }

  await prisma.cartItem.delete({ where: { id: itemId } })

  return c.json({ message: 'Item removed from cart' }, 200)
})

// DELETE / — カートクリア
const clearCart = createRoute({
  method: 'delete',
  path: '/',
  tags: ['Cart'],
  summary: 'カートクリア',
  description: 'カート内の全商品を削除し、カートを削除します。',
  request: {
    headers: z.object({
      'x-user-id': z.string().openapi({ example: 'user-001' }),
    }),
  },
  responses: {
    200: {
      description: 'カートクリア完了',
      content: { 'application/json': { schema: MessageSchema } },
    },
    401: {
      description: '認証エラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    404: {
      description: 'カートが見つかりません',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    500: {
      description: 'サーバーエラー',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(clearCart, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'X-User-Id header is required' }, 401)
  }

  const cart = await prisma.cart.findUnique({ where: { userId } })

  if (!cart) {
    return c.json({ error: 'Cart not found' }, 404)
  }

  await prisma.cart.delete({ where: { id: cart.id } })

  return c.json({ message: 'Cart cleared' }, 200)
})

export default app
