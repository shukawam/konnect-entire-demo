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
  it('returns 400 without X-User-Id header', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(400)
  })

  it('returns 200 with existing cart', async () => {
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

  it('creates and returns a cart when not found', async () => {
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
  it('returns 201 with upserted cart', async () => {
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

  it('increments quantity when item already exists', async () => {
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
  it('returns 404 when item not found', async () => {
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

  it('updates quantity when > 0', async () => {
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

  it('deletes item when quantity <= 0', async () => {
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
  it('returns 200 when item deleted', async () => {
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

  it('returns 404 when item not found', async () => {
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
  it('returns 200 when cart deleted', async () => {
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

  it('returns 404 when cart not found', async () => {
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
