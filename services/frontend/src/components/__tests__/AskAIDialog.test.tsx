import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// useSession をモックすれば useAuthUser 経由のゲートを検証できる。
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))
// react-markdown は ESM のため、テストでは素通しにモックしてインポートを安定させる。
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => children,
}))

import { useSession } from 'next-auth/react'
import AskAIDialog from '../AskAIDialog'

const mockedUseSession = vi.mocked(useSession)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AskAIDialog 認証ゲート', () => {
  it('未認証のときは何も描画しない（FAB を表示しない）', () => {
    mockedUseSession.mockReturnValue({ data: null, status: 'unauthenticated' } as never)
    const html = renderToStaticMarkup(<AskAIDialog />)
    expect(html).toBe('')
  })

  it('認証済みのときは FAB を描画する', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: { id: 'kc-sub-123', email: 'jack@example.com', name: 'Jack Driscoll' },
        expires: '2999-01-01',
      },
      status: 'authenticated',
    } as never)
    const html = renderToStaticMarkup(<AskAIDialog />)
    expect(html).toContain('ask-ai-fab')
  })

  it('RefreshTokenError のセッションは未認証扱いで描画しない', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: { id: 'kc-sub-123', email: 'jack@example.com', name: 'Jack Driscoll' },
        error: 'RefreshTokenError',
        expires: '2999-01-01',
      },
      status: 'authenticated',
    } as never)
    const html = renderToStaticMarkup(<AskAIDialog />)
    expect(html).toBe('')
  })
})
