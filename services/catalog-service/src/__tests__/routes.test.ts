import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '@prisma/client'

vi.mock('../db.js', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import app from '../routes.js'
import { prisma } from '../db.js'

const mockProduct: Product = {
  id: 'prod-001',
  name: '極上キングバナナ 1房',
  description: 'ジャングル最深部で厳選された特大キングバナナ',
  price: 1980,
  imageUrl: '/images/products/king-banana.jpg',
  category: 'バナナ',
  stock: 50,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
}

const expectedProduct = {
  ...mockProduct,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /', () => {
  it('商品一覧を total, page, limit 付きで返す', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct])
    vi.mocked(prisma.product.count).mockResolvedValue(1)

    const res = await app.request('/')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      products: [expectedProduct],
      total: 1,
      page: 1,
      limit: 20,
    })
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {},
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    })
    expect(prisma.product.count).toHaveBeenCalledWith({ where: {} })
  })

  it('カテゴリでフィルタリングできる', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct])
    vi.mocked(prisma.product.count).mockResolvedValue(1)

    const res = await app.request('/?category=%E3%83%90%E3%83%8A%E3%83%8A')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.products).toEqual([expectedProduct])
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { category: 'バナナ' },
      }),
    )
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: { category: 'バナナ' },
    })
  })

  it('検索キーワードでフィルタリングできる', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct])
    vi.mocked(prisma.product.count).mockResolvedValue(1)

    const res = await app.request('/?search=%E3%82%AD%E3%83%B3%E3%82%B0')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.products).toEqual([expectedProduct])
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'キング' } },
      }),
    )
  })
})

describe('GET /{id}', () => {
  it('商品が存在する場合はその商品を返す', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(mockProduct)

    const res = await app.request('/prod-001')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(expectedProduct)
    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'prod-001' },
    })
  })

  it('商品が存在しない場合 404 を返す', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)

    const res = await app.request('/nonexistent')
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: 'Product not found' })
  })
})

describe('POST /', () => {
  it('商品を作成して 201 を返す', async () => {
    const input = {
      name: '新商品バナナ',
      description: 'テスト用バナナ',
      price: 500,
      imageUrl: '/images/products/new-banana.jpg',
      category: 'バナナ',
      stock: 10,
    }
    const created: Product = { ...mockProduct, ...input, id: 'prod-new' }
    vi.mocked(prisma.product.create).mockResolvedValue(created)

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({
      ...created,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    })
    expect(prisma.product.create).toHaveBeenCalledWith({ data: input })
  })
})
