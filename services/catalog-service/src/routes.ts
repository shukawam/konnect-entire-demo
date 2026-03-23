import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Product } from '../generated/prisma'
import { prisma } from './db.js'

function serializeProduct(product: Product) {
  return {
    ...product,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

const app = new OpenAPIHono()

// Schemas
const ProductSchema = z
  .object({
    id: z.string().openapi({ example: 'prod-001' }),
    name: z.string().openapi({ example: '極上キングバナナ 1房' }),
    description: z.string().openapi({ example: 'ジャングル最深部で厳選された特大キングバナナ' }),
    price: z.number().int().openapi({ example: 1980 }),
    imageUrl: z.string().openapi({ example: '/images/products/king-banana.jpg' }),
    category: z.string().openapi({ example: 'バナナ' }),
    stock: z.number().int().openapi({ example: 50 }),
    createdAt: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
  })
  .openapi('Product')

const ProductListSchema = z
  .object({
    products: z.array(ProductSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
  })
  .openapi('ProductList')

const CreateProductSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    price: z.number().int().positive(),
    imageUrl: z.string().min(1),
    category: z.string().min(1),
    stock: z.number().int().min(0).optional().default(0),
  })
  .openapi('CreateProduct')

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi('Error')

// Routes
const listProducts = createRoute({
  method: 'get',
  path: '/',
  tags: ['Catalog'],
  summary: '商品一覧取得',
  description: '商品一覧を取得します。カテゴリや検索クエリでフィルタリングできます。',
  request: {
    query: z.object({
      category: z.string().optional().openapi({ example: 'バナナ' }),
      search: z.string().optional().openapi({ example: 'ゴリラ' }),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  },
  responses: {
    200: {
      description: '商品一覧',
      content: { 'application/json': { schema: ProductListSchema } },
    },
  },
})

app.openapi(listProducts, async (c) => {
  const { category, search, page, limit } = c.req.valid('query')
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (category) where.category = category
  if (search) where.name = { contains: search }

  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.product.count({ where }),
  ])

  return c.json({ products: products.map(serializeProduct), total, page, limit }, 200)
})

const getProduct = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Catalog'],
  summary: '商品詳細取得',
  request: {
    params: z.object({ id: z.string().openapi({ example: 'prod-001' }) }),
  },
  responses: {
    200: {
      description: '商品詳細',
      content: { 'application/json': { schema: ProductSchema } },
    },
    404: {
      description: '商品が見つかりません',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(getProduct, async (c) => {
  const { id } = c.req.valid('param')
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) return c.json({ error: 'Product not found' }, 404)
  return c.json(serializeProduct(product), 200)
})

const createProduct = createRoute({
  method: 'post',
  path: '/',
  tags: ['Catalog'],
  summary: '商品作成',
  description: '新しい商品を作成します（管理者用）。',
  request: {
    body: { content: { 'application/json': { schema: CreateProductSchema } } },
  },
  responses: {
    201: {
      description: '作成された商品',
      content: { 'application/json': { schema: ProductSchema } },
    },
  },
})

app.openapi(createProduct, async (c) => {
  const data = c.req.valid('json')
  const product = await prisma.product.create({ data })
  return c.json(serializeProduct(product), 201)
})

export default app
