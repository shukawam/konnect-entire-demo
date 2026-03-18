import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db.js', () => ({
  prisma: {
    shipment: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}))

import app from '../routes.js'
import { prisma } from '../db.js'

const mockFindMany = prisma.shipment.findMany as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.shipment.findUnique as ReturnType<typeof vi.fn>

const shipmentFixture = {
  id: 'ship-1',
  orderId: 'order-1',
  userId: 'user-1',
  status: 'SHIPPED',
  trackingNumber: '1Z999AA10123456784',
  shippedAt: '2025-01-01T00:00:00.000Z',
  deliveredAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /', () => {
  it('returns 400 without X-User-Id header', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(400)
  })

  it('returns 200 with shipments', async () => {
    mockFindMany.mockResolvedValue([shipmentFixture])

    const res = await app.request('/', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([shipmentFixture])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('GET /{id}', () => {
  it('returns 200 when found and correct user', async () => {
    mockFindUnique.mockResolvedValue(shipmentFixture)

    const res = await app.request('/ship-1', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(shipmentFixture)
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'ship-1' } })
  })

  it('returns 404 when not found', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.request('/ship-999', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 403 when wrong user', async () => {
    mockFindUnique.mockResolvedValue(shipmentFixture)

    const res = await app.request('/ship-1', {
      headers: { 'X-User-Id': 'user-other' },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('GET /order/{orderId}', () => {
  it('returns 200 when found and correct user', async () => {
    mockFindUnique.mockResolvedValue(shipmentFixture)

    const res = await app.request('/order/order-1', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(shipmentFixture)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
    })
  })

  it('returns 404 when not found', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.request('/order/order-999', {
      headers: { 'X-User-Id': 'user-1' },
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 403 when wrong user', async () => {
    mockFindUnique.mockResolvedValue(shipmentFixture)

    const res = await app.request('/order/order-1', {
      headers: { 'X-User-Id': 'user-other' },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})
