import { describe, it, expect, vi, beforeEach } from 'vitest'

// useAuthUser は useSession を呼び出してマッピングするだけなので、
// next-auth/react をモックすれば React レンダラー無しで検証できる。
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

import { useSession } from 'next-auth/react'
import { useAuthUser } from '../auth'

const mockedUseSession = vi.mocked(useSession)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAuthUser', () => {
  it('認証済みセッションからユーザーを返す', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: { id: 'kc-sub-123', email: 'user@example.com', name: 'ゴリラ太郎' },
        expires: '2999-01-01',
      },
      status: 'authenticated',
    } as never)

    const { user, status } = useAuthUser()
    expect(status).toBe('authenticated')
    expect(user).toEqual({ id: 'kc-sub-123', email: 'user@example.com', name: 'ゴリラ太郎' })
  })

  it('未認証の場合は user が null', () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as never)

    const { user, status } = useAuthUser()
    expect(status).toBe('unauthenticated')
    expect(user).toBeNull()
  })

  it('リフレッシュ失敗(error)のセッションは未認証扱いで user を返さない', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: { id: 'kc-sub-123', email: 'user@example.com', name: 'ゴリラ太郎' },
        error: 'RefreshTokenError',
        expires: '2999-01-01',
      },
      // NextAuth の Cookie 自体は生きているので status は authenticated のまま来るが、
      // トークンが失効しているので未認証として扱う。
      status: 'authenticated',
    } as never)

    const { user, status } = useAuthUser()
    expect(status).toBe('unauthenticated')
    expect(user).toBeNull()
  })

  it('email / name が欠けても空文字で補完する', () => {
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'kc-sub-789' }, expires: '2999-01-01' },
      status: 'authenticated',
    } as never)

    const { user } = useAuthUser()
    expect(user).toEqual({ id: 'kc-sub-789', email: '', name: '' })
  })
})
