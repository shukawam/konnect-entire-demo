import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db.js', () => ({
  prisma: {
    order: {
      update: vi.fn(),
    },
  },
}))

vi.mock('../kafka.js', () => ({
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
    },
    trace: {
      getTracer: vi.fn(() => ({
        startSpan: vi.fn(() => noopSpan),
      })),
    },
  }
})

import { prisma } from '../db.js'
import { consumer } from '../kafka.js'
import { startConsumer } from '../consumer.js'

type EachMessageHandler = (payload: {
  topic: string
  message: { value: Buffer | null; headers?: Record<string, Buffer> }
}) => Promise<void>

let messageHandler: EachMessageHandler

beforeEach(async () => {
  vi.clearAllMocks()

  vi.mocked(consumer.run).mockImplementation(async ({ eachMessage }) => {
    messageHandler = eachMessage as unknown as EachMessageHandler
  })

  await startConsumer()
})

describe('order.status-updated consumer', () => {
  it('有効なイベントで注文ステータスを更新する', async () => {
    vi.mocked(prisma.order.update).mockResolvedValue({} as any)

    await messageHandler({
      topic: 'order.status-updated',
      message: {
        value: Buffer.from(
          JSON.stringify({
            orderId: 'order-1',
            status: 'CONFIRMED',
          }),
        ),
        headers: {},
      },
    })

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'CONFIRMED' },
    })
  })

  it('SHIPPED ステータスの更新を処理する', async () => {
    vi.mocked(prisma.order.update).mockResolvedValue({} as any)

    await messageHandler({
      topic: 'order.status-updated',
      message: {
        value: Buffer.from(
          JSON.stringify({
            orderId: 'order-1',
            status: 'SHIPPED',
            trackingNumber: 'TRK-12345678',
          }),
        ),
        headers: {},
      },
    })

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'SHIPPED' },
    })
  })

  it('value が null のメッセージをスキップする', async () => {
    await messageHandler({
      topic: 'order.status-updated',
      message: { value: null, headers: {} },
    })

    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('order.status-updated 以外のトピックは無視する', async () => {
    await messageHandler({
      topic: 'other.topic',
      message: {
        value: Buffer.from(JSON.stringify({ orderId: 'order-1', status: 'CONFIRMED' })),
        headers: {},
      },
    })

    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('orderId が欠落したイベントをスキップする', async () => {
    await messageHandler({
      topic: 'order.status-updated',
      message: {
        value: Buffer.from(JSON.stringify({ status: 'CONFIRMED' })),
        headers: {},
      },
    })

    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('DB エラー時にエラーを握りつぶして処理を継続する', async () => {
    vi.mocked(prisma.order.update).mockRejectedValue(new Error('DB error'))

    await expect(
      messageHandler({
        topic: 'order.status-updated',
        message: {
          value: Buffer.from(JSON.stringify({ orderId: 'order-1', status: 'CONFIRMED' })),
          headers: {},
        },
      }),
    ).resolves.not.toThrow()
  })
})
