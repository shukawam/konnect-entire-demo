import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db.js', () => ({
  prisma: {
    shipment: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('../kafka.js', () => ({
  producer: {
    send: vi.fn().mockResolvedValue(undefined),
  },
  consumer: {
    run: vi.fn(),
  },
}))

vi.mock('@opentelemetry/api', () => {
  const noopSpan = {
    end: vi.fn(),
    recordException: vi.fn(),
  }
  return {
    context: {
      active: vi.fn(() => ({})),
      with: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
    },
    propagation: {
      extract: vi.fn((_ctx: unknown) => ({})),
      inject: vi.fn(),
    },
    trace: {
      getTracer: vi.fn(() => ({
        startSpan: vi.fn(() => noopSpan),
      })),
      setSpan: vi.fn((_ctx: unknown) => ({})),
    },
  }
})

import { prisma } from '../db.js'
import { consumer, producer } from '../kafka.js'
import { startConsumer } from '../consumer.js'

type EachMessageHandler = (payload: {
  message: { value: Buffer | null; headers?: Record<string, Buffer> }
}) => Promise<void>

let messageHandler: EachMessageHandler

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers()

  vi.mocked(consumer.run).mockImplementation(async ({ eachMessage }) => {
    messageHandler = eachMessage as unknown as EachMessageHandler
  })

  await startConsumer()
})

describe('order.created consumer', () => {
  it('creates a shipment and publishes CONFIRMED event', async () => {
    const shipment = {
      id: 'ship-1',
      orderId: 'order-1',
      userId: 'user-1',
      status: 'PROCESSING',
      trackingNumber: 'TRK-ABCD1234',
    }
    vi.mocked(prisma.shipment.create).mockResolvedValue(shipment as any)

    await messageHandler({
      message: {
        value: Buffer.from(JSON.stringify({ orderId: 'order-1', userId: 'user-1' })),
        headers: {},
      },
    })

    expect(prisma.shipment.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        userId: 'user-1',
        status: 'PROCESSING',
        trackingNumber: expect.stringMatching(/^TRK-[A-F0-9]{8}$/),
      },
    })

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'order.status-updated',
      messages: [
        {
          key: 'order-1',
          value: expect.stringContaining('"status":"CONFIRMED"'),
          headers: expect.any(Object),
        },
      ],
    })
  })

  it('updates shipment to SHIPPED after timeout', async () => {
    const shipment = {
      id: 'ship-1',
      orderId: 'order-1',
      userId: 'user-1',
      status: 'PROCESSING',
      trackingNumber: 'TRK-ABCD1234',
    }
    vi.mocked(prisma.shipment.create).mockResolvedValue(shipment as any)
    vi.mocked(prisma.shipment.update).mockResolvedValue({
      ...shipment,
      status: 'SHIPPED',
    } as any)

    await messageHandler({
      message: {
        value: Buffer.from(JSON.stringify({ orderId: 'order-1', userId: 'user-1' })),
        headers: {},
      },
    })

    // Clear the CONFIRMED send call
    vi.mocked(producer.send).mockClear()

    // Advance timers to trigger the setTimeout(5000)
    await vi.advanceTimersByTimeAsync(5000)

    expect(prisma.shipment.update).toHaveBeenCalledWith({
      where: { id: 'ship-1' },
      data: {
        status: 'SHIPPED',
        shippedAt: expect.any(Date),
      },
    })

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'order.status-updated',
      messages: [
        {
          key: 'order-1',
          value: expect.stringContaining('"status":"SHIPPED"'),
          headers: expect.any(Object),
        },
      ],
    })
  })

  it('skips messages with null value', async () => {
    await messageHandler({
      message: { value: null, headers: {} },
    })

    expect(prisma.shipment.create).not.toHaveBeenCalled()
  })

  it('skips events with missing orderId or userId', async () => {
    await messageHandler({
      message: {
        value: Buffer.from(JSON.stringify({ orderId: 'order-1' })),
        headers: {},
      },
    })

    expect(prisma.shipment.create).not.toHaveBeenCalled()
  })

  it('handles create error gracefully', async () => {
    vi.mocked(prisma.shipment.create).mockRejectedValue(new Error('DB error'))

    await expect(
      messageHandler({
        message: {
          value: Buffer.from(JSON.stringify({ orderId: 'order-1', userId: 'user-1' })),
          headers: {},
        },
      }),
    ).resolves.not.toThrow()
  })
})
