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
// 開くとサジェスト取得が走るためネットワークをモックする。パス別に応答を出し分けられるよう、
// 実装は各テストの beforeEach / 個別テストで mockImplementation を設定する。
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}))

import { useSession } from 'next-auth/react'
import { apiFetch } from '@/lib/api'
import AskAIDialog from '../AskAIDialog'

const mockedUseSession = vi.mocked(useSession)
const mockedApiFetch = vi.mocked(apiFetch)

// React 19 の act 環境フラグ。
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom は scrollIntoView 未実装のため、メッセージ更新時の自動スクロール副作用をスタブ化する。
window.HTMLElement.prototype.scrollIntoView = vi.fn()

const authenticatedSession = {
  data: {
    user: { id: 'kc-sub-123', email: 'jack@example.com', name: 'Jack Driscoll' },
    expires: '2999-01-01',
  },
  status: 'authenticated',
} as never

// デフォルトはサジェスト・エージェント一覧とも空。個別テストで上書きする。
function defaultApiFetchImpl(path: string): Promise<unknown> {
  if (path === '/api/agent/agents') return Promise.resolve({ agents: [] })
  return Promise.resolve({ suggestions: [] })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApiFetch.mockImplementation(defaultApiFetchImpl as never)
})

// React の value tracker を回避して input の値を変更し、onChange を発火させる。
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function renderOpenDialog() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<AskAIDialog />)
  })
  await act(async () => {
    window.dispatchEvent(new Event('ask-ai-toggle'))
  })
  return { container, root }
}

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

describe('AskAIDialog Agent モード', () => {
  it('トグルで welcome 文言・トグルの見た目が切り替わり、会話状態がリセットされる', async () => {
    mockedUseSession.mockReturnValue(authenticatedSession)
    const { container, root } = await renderOpenDialog()

    expect(container.querySelector('.ask-ai-welcome')?.textContent).toContain(
      'ゴリラストアについて',
    )
    const toggleBtn = container.querySelector('.ask-ai-mode-toggle') as HTMLButtonElement
    expect(toggleBtn.className).not.toContain('active')
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      toggleBtn.click()
    })

    expect(toggleBtn.className).toContain('active')
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.ask-ai-welcome')?.textContent).toContain('Agent モードです')

    await act(async () => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('Agent モード ON で /api/agent/agents を取得し、発見済みエージェントをチップ表示する', async () => {
    mockedUseSession.mockReturnValue(authenticatedSession)
    mockedApiFetch.mockImplementation(((path: string) => {
      if (path === '/api/agent/agents') {
        return Promise.resolve({
          agents: [
            { key: 'shopper', name: 'Shopper Agent', description: '買い物窓口', skills: [] },
          ],
        })
      }
      return Promise.resolve({ suggestions: [] })
    }) as never)

    const { container, root } = await renderOpenDialog()
    const toggleBtn = container.querySelector('.ask-ai-mode-toggle') as HTMLButtonElement
    await act(async () => {
      toggleBtn.click()
    })
    // agents 取得の Promise 解決を待つ。
    await act(async () => {
      await Promise.resolve()
    })

    const chip = container.querySelector('.ask-ai-agent-chip')
    expect(chip?.textContent).toBe('Shopper Agent')

    await act(async () => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('Agent モードでは想定質問（サジェスト）バーが非表示になる', async () => {
    mockedUseSession.mockReturnValue(authenticatedSession)
    mockedApiFetch.mockImplementation(((path: string) => {
      if (path === '/api/agent/suggestions') {
        return Promise.resolve({ suggestions: ['おすすめは？'] })
      }
      return Promise.resolve({ agents: [] })
    }) as never)

    const { container, root } = await renderOpenDialog()
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelector('.ask-ai-suggestion-bar')).not.toBeNull()

    const toggleBtn = container.querySelector('.ask-ai-mode-toggle') as HTMLButtonElement
    await act(async () => {
      toggleBtn.click()
    })
    expect(container.querySelector('.ask-ai-suggestion-bar')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('Agent モードでメッセージ送信すると応答にバッジが付き、input-required で pending 表示が出る', async () => {
    mockedUseSession.mockReturnValue(authenticatedSession)
    mockedApiFetch.mockImplementation(((path: string) => {
      if (path === '/api/agent/chat') {
        return Promise.resolve({
          conversationId: 'conv-1',
          reply: 'ご希望のサイズを教えてください',
          agent: 'order',
          state: 'input-required',
        })
      }
      if (path === '/api/agent/agents') return Promise.resolve({ agents: [] })
      return Promise.resolve({ suggestions: [] })
    }) as never)

    const { container, root } = await renderOpenDialog()
    const toggleBtn = container.querySelector('.ask-ai-mode-toggle') as HTMLButtonElement
    await act(async () => {
      toggleBtn.click()
    })

    const input = container.querySelector('.ask-ai-input-bar input') as HTMLInputElement
    await act(async () => {
      setInputValue(input, 'Tシャツが欲しい')
    })
    const sendBtn = container.querySelector('.ask-ai-send') as HTMLButtonElement
    await act(async () => {
      sendBtn.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/agent/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ conversationId: undefined, message: 'Tシャツが欲しい' }),
      }),
    )
    const badge = container.querySelector('.ask-ai-agent-badge-order')
    expect(badge?.textContent).toBe('Order Agent')
    expect(container.querySelector('.ask-ai-pending')?.textContent).toContain(
      'Order Agent が入力を待っています',
    )

    await act(async () => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('pending 表示中に次の送信が失敗すると、エラーメッセージ表示と共に pending 表示が消える', async () => {
    mockedUseSession.mockReturnValue(authenticatedSession)
    let chatCallCount = 0
    mockedApiFetch.mockImplementation(((path: string) => {
      if (path === '/api/agent/chat') {
        chatCallCount += 1
        if (chatCallCount === 1) {
          return Promise.resolve({
            conversationId: 'conv-1',
            reply: 'ご希望のサイズを教えてください',
            agent: 'order',
            state: 'input-required',
          })
        }
        return Promise.reject(
          new Error('サービスが一時的に利用できません。しばらくしてから再度お試しください'),
        )
      }
      if (path === '/api/agent/agents') return Promise.resolve({ agents: [] })
      return Promise.resolve({ suggestions: [] })
    }) as never)

    const { container, root } = await renderOpenDialog()
    const toggleBtn = container.querySelector('.ask-ai-mode-toggle') as HTMLButtonElement
    await act(async () => {
      toggleBtn.click()
    })

    const input = container.querySelector('.ask-ai-input-bar input') as HTMLInputElement
    const sendBtn = container.querySelector('.ask-ai-send') as HTMLButtonElement

    // 1 通目: input-required → pending 表示が出る
    await act(async () => {
      setInputValue(input, 'Tシャツが欲しい')
    })
    await act(async () => {
      sendBtn.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelector('.ask-ai-pending')?.textContent).toContain(
      'Order Agent が入力を待っています',
    )

    // 2 通目: apiFetch が reject → エラーメッセージが assistant として追加され、pending 表示は消える
    await act(async () => {
      setInputValue(input, 'Mサイズで')
    })
    await act(async () => {
      sendBtn.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.ask-ai-pending')).toBeNull()
    const lastMsg = container.querySelectorAll('.ask-ai-msg-assistant .ask-ai-msg-content')
    expect(lastMsg[lastMsg.length - 1]?.textContent).toContain('サービスが一時的に利用できません')

    await act(async () => {
      root.unmount()
    })
    document.body.removeChild(container)
  })
})
