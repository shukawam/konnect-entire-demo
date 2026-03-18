import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db.js', () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('../kafka.js', () => ({
  producer: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}))

import app from '../routes.js'
import { prisma } from '../db.js'
import { producer } from '../kafka.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------- GET / ----------

describe('GET /', () => {
  it('returns 400 without X-User-Id header', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(400)
  })

  it('returns 200 with orders', async () => {
    const orders = [
      {
        id: 'order-1',
        userId: 'user-1',
        status: 'PENDING',
        totalPrice: 3000,
        items: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as any)

    const res = await app.request('/', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(orders)
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
  })
})

// ---------- GET /{id} ----------

describe('GET /{id}', () => {
  it('returns 200 when order found and belongs to user', async () => {
    const order = {
      id: 'order-1',
      userId: 'user-1',
      status: 'PENDING',
      totalPrice: 3000,
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    vi.mocked(prisma.order.findUnique).mockResolvedValue(order as any)

    const res = await app.request('/order-1', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(order)
  })

  it('returns 404 when order not found', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    const res = await app.request('/order-999', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Order not found')
  })

  it('returns 403 when order belongs to different user', async () => {
    const order = {
      id: 'order-1',
      userId: 'user-2',
      status: 'PENDING',
      totalPrice: 3000,
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    vi.mocked(prisma.order.findUnique).mockResolvedValue(order as any)

    const res = await app.request('/order-1', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
  })
})

// ---------- POST / ----------

describe('POST /', () => {
  it('returns 400 without X-User-Id header', async () => {
    const res = await app.request('/', { method: 'POST' })
    expect(res.status).toBe(400)
  })

  it('returns 201 on success, publishes event, and clears cart', async () => {
    const cartItems = [{ productId: 'prod-1', quantity: 2, price: 1500 }]
    const createdOrder = {
      id: 'order-1',
      userId: 'user-1',
      status: 'PENDING',
      totalPrice: 3000,
      items: [{ id: 'item-1', orderId: 'order-1', productId: 'prod-1', quantity: 2, price: 1500 }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    // 1st call: GET cart, 2nd call: GET product (stock check), 3rd call: DELETE cart
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: cartItems }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'prod-1', name: 'Test Product', stock: 10 }),
      } as any)
      .mockResolvedValueOnce({ ok: true } as any)

    vi.mocked(prisma.order.create).mockResolvedValue(createdOrder as any)

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'X-User-Id': 'user-1' },
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual(createdOrder)

    // Verify Kafka event published
    expect(producer.send).toHaveBeenCalledWith({
      topic: 'order.created',
      messages: [
        {
          key: 'order-1',
          value: JSON.stringify({
            orderId: 'order-1',
            userId: 'user-1',
            items: createdOrder.items,
            totalPrice: 3000,
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        },
      ],
    })

    // Verify cart cleared (3rd fetch call is DELETE)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const deleteCall = mockFetch.mock.calls[2]
    expect(deleteCall[0]).toBe('http://localhost:3002/api/carts')
    expect(deleteCall[1]).toMatchObject({
      method: 'DELETE',
      headers: { 'X-User-Id': 'user-1' },
    })
  })

  it('returns 502 when cart fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as any)

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'X-User-Id': 'user-1' },
    })

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('Failed to fetch cart')
  })

  it('returns 400 when stock is insufficient', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ productId: 'prod-1', quantity: 5, price: 1500 }] }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'prod-1', name: 'Test Product', stock: 2 }),
      } as any)

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'X-User-Id': 'user-1' },
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('在庫不足')
  })

  it('returns 400 when cart is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as any)

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'X-User-Id': 'user-1' },
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Cart is empty')
  })
})
