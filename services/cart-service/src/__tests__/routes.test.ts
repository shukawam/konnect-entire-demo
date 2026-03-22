import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db.js', () => ({
  prisma: {
    cart: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    cartItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import app from '../routes.js'
import { prisma } from '../db.js'

const mockCart = {
  id: 'cart-001',
  userId: 'user-001',
  items: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const mockItem = {
  id: 'item-001',
  cartId: 'cart-001',
  productId: 'prod-001',
  quantity: 2,
  price: 2980,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /', () => {
  it('X-User-Id ヘッダーがない場合 400 を返す', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(400)
  })

  it('既存のカートがある場合 200 で返す', async () => {
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(mockCart as any)

    const res = await app.request('/', {
      headers: { 'X-User-Id': 'user-001' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(mockCart)
    expect(prisma.cart.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-001' },
      include: { items: true },
    })
  })

  it('カートが存在しない場合は新規作成して返す', async () => {
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.cart.create).mockResolvedValue(mockCart as any)

    const res = await app.request('/', {
      headers: { 'X-User-Id': 'user-001' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(mockCart)
    expect(prisma.cart.create).toHaveBeenCalledWith({
      data: { userId: 'user-001' },
      include: { items: true },
    })
  })
})

describe('POST /items', () => {
  it('新規アイテムを追加して 201 を返す', async () => {
    const cartWithItem = { ...mockCart, items: [mockItem] }
    // cart exists
    vi.mocked(prisma.cart.findUnique)
      .mockResolvedValueOnce({ id: 'cart-001', userId: 'user-001' } as any) // ensure cart
      .mockResolvedValueOnce(cartWithItem as any) // return updated cart
    // no existing item
    vi.mocked(prisma.cartItem.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.cartItem.create).mockResolvedValue(mockItem as any)

    const res = await app.request('/items', {
      method: 'POST',
      headers: {
        'X-User-Id': 'user-001',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: 'prod-001', quantity: 2, price: 2980 }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual(cartWithItem)
    expect(prisma.cartItem.create).toHaveBeenCalled()
  })

  it('既存アイテムの場合は数量を加算する', async () => {
    const existingItem = { ...mockItem, quantity: 1 }
    const cartWithItem = { ...mockCart, items: [{ ...mockItem, quantity: 3 }] }
    vi.mocked(prisma.cart.findUnique)
      .mockResolvedValueOnce({ id: 'cart-001', userId: 'user-001' } as any)
      .mockResolvedValueOnce(cartWithItem as any)
    vi.mocked(prisma.cartItem.findUnique).mockResolvedValue(existingItem as any)
    vi.mocked(prisma.cartItem.update).mockResolvedValue({ ...mockItem, quantity: 3 } as any)

    const res = await app.request('/items', {
      method: 'POST',
      headers: {
        'X-User-Id': 'user-001',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: 'prod-001', quantity: 2, price: 2980 }),
    })
    expect(res.status).toBe(201)
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'item-001' },
      data: { quantity: 3, price: 2980 },
    })
  })
})

describe('PATCH /items/:id', () => {
  it('アイテムが存在しない場合 404 を返す', async () => {
    vi.mocked(prisma.cartItem.findUnique).mockResolvedValue(null)

    const res = await app.request('/items/item-999', {
      method: 'PATCH',
      headers: {
        'X-User-Id': 'user-001',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantity: 5 }),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Item not found')
  })

  it('数量が正の場合は更新する', async () => {
    vi.mocked(prisma.cartItem.findUnique).mockResolvedValue(mockItem as any)
    vi.mocked(prisma.cartItem.update).mockResolvedValue({ ...mockItem, quantity: 5 } as any)

    const res = await app.request('/items/item-001', {
      method: 'PATCH',
      headers: {
        'X-User-Id': 'user-001',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantity: 5 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.quantity).toBe(5)
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'item-001' },
      data: { quantity: 5 },
    })
  })

  it('数量が 0 以下の場合はアイテムを削除する', async () => {
    vi.mocked(prisma.cartItem.findUnique).mockResolvedValue(mockItem as any)
    vi.mocked(prisma.cartItem.delete).mockResolvedValue(mockItem as any)

    const res = await app.request('/items/item-001', {
      method: 'PATCH',
      headers: {
        'X-User-Id': 'user-001',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantity: 0 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('Item removed from cart')
    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'item-001' } })
  })
})

describe('DELETE /items/:id', () => {
  it('アイテムを削除して 200 を返す', async () => {
    vi.mocked(prisma.cartItem.findUnique).mockResolvedValue(mockItem as any)
    vi.mocked(prisma.cartItem.delete).mockResolvedValue(mockItem as any)

    const res = await app.request('/items/item-001', {
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-001' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('Item removed from cart')
  })

  it('アイテムが存在しない場合 404 を返す', async () => {
    vi.mocked(prisma.cartItem.findUnique).mockResolvedValue(null)

    const res = await app.request('/items/item-999', {
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-001' },
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Item not found')
  })
})

describe('DELETE /', () => {
  it('カートを削除して 200 を返す', async () => {
    vi.mocked(prisma.cart.findUnique).mockResolvedValue({
      id: 'cart-001',
      userId: 'user-001',
    } as any)
    vi.mocked(prisma.cart.delete).mockResolvedValue(mockCart as any)

    const res = await app.request('/', {
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-001' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('Cart cleared')
  })

  it('カートが存在しない場合 404 を返す', async () => {
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(null)

    const res = await app.request('/', {
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-001' },
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Cart not found')
  })
})
