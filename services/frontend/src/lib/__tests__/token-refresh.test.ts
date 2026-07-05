import { describe, it, expect, vi } from 'vitest'
import { isAccessTokenValid, refreshAccessToken } from '../token-refresh'

const REFRESH_OPTS = {
  tokenEndpoint: 'http://keycloak:8081/realms/jungle-store/protocol/openid-connect/token',
  clientId: 'jungle-store-frontend',
  clientSecret: 'secret',
}

describe('isAccessTokenValid', () => {
  const now = 1_000_000_000_000 // 固定の現在時刻(ms)

  it('有効期限まで十分に猶予があれば true', () => {
    // expiresAt はエポック秒。now の 5 分後。
    const token = { expiresAt: now / 1000 + 300 }
    expect(isAccessTokenValid(token, now)).toBe(true)
  })

  it('既に失効していれば false', () => {
    const token = { expiresAt: now / 1000 - 1 }
    expect(isAccessTokenValid(token, now)).toBe(false)
  })

  it('マージン(30秒)以内に切れる場合は事前更新のため false', () => {
    const token = { expiresAt: now / 1000 + 10 }
    expect(isAccessTokenValid(token, now)).toBe(false)
  })

  it('expiresAt が無ければ false（判定不能なので更新を促す）', () => {
    expect(isAccessTokenValid({}, now)).toBe(false)
  })
})

describe('refreshAccessToken', () => {
  const now = 1_000_000_000_000

  it('refresh_token でアクセストークンを更新し expiresAt / error を更新する', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 300,
        }),
        { status: 200 },
      ),
    )

    const result = await refreshAccessToken(
      { accessToken: 'old', refreshToken: 'old-refresh', expiresAt: now / 1000 - 1 },
      { ...REFRESH_OPTS, fetchImpl, now },
    )

    expect(result.accessToken).toBe('new-access')
    expect(result.refreshToken).toBe('new-refresh')
    expect(result.expiresAt).toBe(now / 1000 + 300)
    expect(result.error).toBeUndefined()

    // Keycloak の token エンドポイントへ grant_type=refresh_token で POST している
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe(REFRESH_OPTS.tokenEndpoint)
    expect(options.method).toBe('POST')
    const body = options.body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('old-refresh')
    expect(body.get('client_id')).toBe(REFRESH_OPTS.clientId)
    expect(body.get('client_secret')).toBe(REFRESH_OPTS.clientSecret)
  })

  it('レスポンスに refresh_token が無ければ既存の refresh_token を維持する', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'new-access', expires_in: 300 }), {
        status: 200,
      }),
    )

    const result = await refreshAccessToken(
      { refreshToken: 'keep-me', expiresAt: now / 1000 - 1 },
      { ...REFRESH_OPTS, fetchImpl, now },
    )

    expect(result.refreshToken).toBe('keep-me')
    expect(result.accessToken).toBe('new-access')
  })

  it('refresh_token が無ければ更新せず error を立てる', async () => {
    const fetchImpl = vi.fn()

    const result = await refreshAccessToken(
      { accessToken: 'old', expiresAt: now / 1000 - 1 },
      { ...REFRESH_OPTS, fetchImpl, now },
    )

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.error).toBe('RefreshTokenError')
  })

  it('Keycloak が失敗（refresh_token 失効など）を返したら error を立てる', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))

    const result = await refreshAccessToken(
      { accessToken: 'old', refreshToken: 'expired', expiresAt: now / 1000 - 1 },
      { ...REFRESH_OPTS, fetchImpl, now },
    )

    expect(result.error).toBe('RefreshTokenError')
    // 失効したアクセストークンはそのまま（session 側で未認証扱いにする）
    expect(result.accessToken).toBe('old')
  })

  it('expires_in が欠落した異常応答は error 扱い（即時失効ループを防ぐ）', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'new-access' }), { status: 200 }),
      )

    const result = await refreshAccessToken(
      { accessToken: 'old', refreshToken: 'r', expiresAt: now / 1000 - 1 },
      { ...REFRESH_OPTS, fetchImpl, now },
    )

    expect(result.error).toBe('RefreshTokenError')
  })

  it('fetch が例外を投げても error を立てて握りつぶす', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await refreshAccessToken(
      { refreshToken: 'r', expiresAt: now / 1000 - 1 },
      { ...REFRESH_OPTS, fetchImpl, now },
    )

    expect(result.error).toBe('RefreshTokenError')
  })
})
