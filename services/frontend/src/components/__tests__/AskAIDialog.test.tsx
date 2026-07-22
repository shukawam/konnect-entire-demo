import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'

// useSession をモックすれば useAuthUser 経由のゲートを検証できる。
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))
// react-markdown は ESM のため、テストでは素通しにモックしてインポートを安定させる。
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => children,
}))
// 開くとサジェスト取得が走るためネットワークをモックする。
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ suggestions: [] }),
}))

import { useSession } from 'next-auth/react'
import AskAIDialog from '../AskAIDialog'

const mockedUseSession = vi.mocked(useSession)

// React 19 の act 環境フラグ。
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const authenticatedSession = {
  data: {
    user: { id: 'kc-sub-123', email: 'jack@example.com', name: 'Jack Driscoll' },
    expires: '2999-01-01',
  },
  status: 'authenticated',
} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AskAIDialog 認証ゲート', () => {
  it('未認証のときは何も描画しない', () => {
    mockedUseSession.mockReturnValue({ data: null, status: 'unauthenticated' } as never)
    const html = renderToStaticMarkup(<AskAIDialog />)
    expect(html).toBe('')
  })

  it('認証済みでも初期状態（未オープン）ではダイアログを描画しない', () => {
    mockedUseSession.mockReturnValue(authenticatedSession)
    const html = renderToStaticMarkup(<AskAIDialog />)
    expect(html).toBe('')
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

describe('AskAIDialog ヘッダートリガー連携', () => {
  it("'ask-ai-toggle' イベントでダイアログを開閉する", async () => {
    mockedUseSession.mockReturnValue(authenticatedSession)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<AskAIDialog />)
    })
    // 初期は閉じている
    expect(container.querySelector('.ask-ai-dialog')).toBeNull()

    // トリガー → 開く
    await act(async () => {
      window.dispatchEvent(new Event('ask-ai-toggle'))
    })
    expect(container.querySelector('.ask-ai-dialog')).not.toBeNull()

    // 再度トリガー → 閉じる
    await act(async () => {
      window.dispatchEvent(new Event('ask-ai-toggle'))
    })
    expect(container.querySelector('.ask-ai-dialog')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    document.body.removeChild(container)
  })
})
