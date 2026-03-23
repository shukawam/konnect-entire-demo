import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Shipment } from '../../generated/prisma'

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

const mockShipment: Shipment = {
  id: 'ship-1',
  orderId: 'order-1',
  userId: 'user-1',
  status: 'PROCESSING',
  trackingNumber: 'TRK-ABCD1234',
  shippedAt: null,
  deliveredAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers()

  vi.mocked(consumer.run).mockImplementation(async ({ eachMessage }) => {
    messageHandler = eachMessage as unknown as EachMessageHandler
  })

  await startConsumer()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('order.created consumer', () => {
  it('配送を作成し CONFIRMED イベントを発行する', async () => {
    vi.mocked(prisma.shipment.create).mockResolvedValue(mockShipment)

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

  it('タイムアウト後に配送ステータスを SHIPPED に更新する', async () => {
    vi.mocked(prisma.shipment.create).mockResolvedValue(mockShipment)
    const shippedShipment: Shipment = {
      ...mockShipment,
      status: 'SHIPPED',
    }
    vi.mocked(prisma.shipment.update).mockResolvedValue(shippedShipment)

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

  it('value が null のメッセージをスキップする', async () => {
    await messageHandler({
      message: { value: null, headers: {} },
    })

    expect(prisma.shipment.create).not.toHaveBeenCalled()
  })

  it('orderId または userId が欠落したイベントをスキップする', async () => {
    await messageHandler({
      message: {
        value: Buffer.from(JSON.stringify({ orderId: 'order-1' })),
        headers: {},
      },
    })

    expect(prisma.shipment.create).not.toHaveBeenCalled()
  })

  it('DB エラー時にエラーを握りつぶして処理を継続する', async () => {
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
