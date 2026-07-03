import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// セッション取得をモックして、proxy がサーバー側で Bearer を付与することを検証する。
vi.mock('@/auth', () => ({ auth: vi.fn() }))

import { GET } from '../route'
import { auth } from '@/auth'

const mockedAuth = vi.mocked(auth)
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue(new Response(null, { status: 200, headers: new Headers() }))
})

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/proxy/api/carts', {
    method: 'GET',
    headers,
  })
}

describe('proxy route', () => {
  it('セッションの access_token を Authorization: Bearer として付与する', async () => {
    mockedAuth.mockResolvedValue({ accessToken: 'kc-access-token' } as never)

    await GET(makeRequest())

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toMatch(/\/api\/carts$/)
    expect(options.headers['authorization']).toBe('Bearer kc-access-token')
  })

  it('クライアント由来の認証ヘッダーは破棄してセッションの値で上書きする', async () => {
    mockedAuth.mockResolvedValue({ accessToken: 'server-token' } as never)

    await GET(
      makeRequest({ authorization: 'Bearer spoofed', 'x-user-id': 'attacker', apikey: 'x' }),
    )

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['authorization']).toBe('Bearer server-token')
    expect(options.headers['x-user-id']).toBeUndefined()
    expect(options.headers['apikey']).toBeUndefined()
  })

  it('未ログイン時は Authorization を付与しない', async () => {
    mockedAuth.mockResolvedValue(null as never)

    await GET(makeRequest())

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['authorization']).toBeUndefined()
  })
})
