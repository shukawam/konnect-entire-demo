import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Shipment } from '@prisma/client'
import type { Context } from 'hono'
import { prisma } from './db.js'

function serializeShipment(shipment: Shipment) {
  return {
    ...shipment,
    shippedAt: shipment.shippedAt?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
  }
}

function getUserId(c: Context): string | null {
  return c.req.header('X-User-Id') || null
}

const app = new OpenAPIHono()

// --- Schemas ---

const ShipmentSchema = z
  .object({
    id: z.string().openapi({ example: 'clxyz...' }),
    orderId: z.string().openapi({ example: 'order-123' }),
    userId: z.string().openapi({ example: 'user-456' }),
    status: z.string().openapi({ example: 'SHIPPED' }),
    trackingNumber: z.string().nullable().openapi({ example: '1Z999AA10123456784' }),
    shippedAt: z.string().nullable().openapi({ example: '2025-01-01T00:00:00.000Z' }),
    deliveredAt: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2025-01-01T00:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2025-01-01T00:00:00.000Z' }),
  })
  .openapi('Shipment')

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'Error message' }),
  })
  .openapi('Error')

const UserIdHeader = z.string().openapi({ example: 'user-456', description: 'User ID' })

// --- Routes ---

const listShipmentsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Shipping'],
  summary: '発送一覧取得',
  request: {
    headers: z.object({ 'x-user-id': UserIdHeader }),
  },
  responses: {
    200: {
      description: '発送一覧',
      content: { 'application/json': { schema: z.array(ShipmentSchema) } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(listShipmentsRoute, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'Unauthorized: X-User-Id header is required' }, 401)
  }

  const shipments = await prisma.shipment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  return c.json(shipments.map(serializeShipment), 200)
})

const getShipmentRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Shipping'],
  summary: '発送詳細取得',
  request: {
    headers: z.object({ 'x-user-id': UserIdHeader }),
    params: z.object({ id: z.string().openapi({ example: 'clxyz...' }) }),
  },
  responses: {
    200: {
      description: '発送詳細',
      content: { 'application/json': { schema: ShipmentSchema } },
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

app.openapi(getShipmentRoute, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'Unauthorized: X-User-Id header is required' }, 401)
  }

  const { id } = c.req.valid('param')

  const shipment = await prisma.shipment.findUnique({
    where: { id },
  })

  if (!shipment) {
    return c.json({ error: 'Shipment not found' }, 404)
  }

  if (shipment.userId !== userId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json(serializeShipment(shipment), 200)
})

const getShipmentByOrderRoute = createRoute({
  method: 'get',
  path: '/order/{orderId}',
  tags: ['Shipping'],
  summary: '注文IDで発送情報取得',
  request: {
    headers: z.object({ 'x-user-id': UserIdHeader }),
    params: z.object({ orderId: z.string().openapi({ example: 'order-123' }) }),
  },
  responses: {
    200: {
      description: '発送詳細',
      content: { 'application/json': { schema: ShipmentSchema } },
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

app.openapi(getShipmentByOrderRoute, async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({ error: 'Unauthorized: X-User-Id header is required' }, 401)
  }

  const { orderId } = c.req.valid('param')

  const shipment = await prisma.shipment.findUnique({
    where: { orderId },
  })

  if (!shipment) {
    return c.json({ error: 'Shipment not found' }, 404)
  }

  if (shipment.userId !== userId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json(serializeShipment(shipment), 200)
})

export default app
