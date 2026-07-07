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

  it('upstream の content-length / content-encoding は転送しない（fetch が gzip を解凍済みのため）', async () => {
    // Node の fetch は gzip を自動解凍するが、レスポンスヘッダには圧縮時の content-length と
    // content-encoding が残る。これらをそのまま返すとブラウザが解凍後の本文を（小さい）
    // content-length の位置で打ち切り、JSON が途中で壊れる（"Unterminated string in JSON"）。
    // Kong の ai-semantic-cache ヒット時に固定 content-length + gzip で返るため顕在化する。
    mockedAuth.mockResolvedValue(null as never)
    mockFetch.mockResolvedValue(
      new Response('{"object":"chat.completion","choices":[]}', {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': '1724',
        }),
      }),
    )

    const res = await GET(makeRequest())

    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-length')).toBeNull()
    expect(res.headers.get('content-type')).toBe('application/json')
  })
})
