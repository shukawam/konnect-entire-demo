// @vitest-environment node
// この fetch ラッパーは Auth.js がサーバー側（Node ランタイム）で使うため node 環境で検証する。
import { describe, it, expect, vi } from 'vitest'
import { createKeycloakFetch } from '../keycloak-fetch'

const PUBLIC = 'http://localhost:8081'
const INTERNAL = 'http://keycloak:8081'

describe('createKeycloakFetch', () => {
  it('公開オリジン宛の string URL を内部オリジンへ書き換える', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok'))
    const f = createKeycloakFetch(PUBLIC, INTERNAL, base as unknown as typeof fetch)

    await f('http://localhost:8081/realms/jungle-store/.well-known/openid-configuration')

    expect(base).toHaveBeenCalledWith(
      'http://keycloak:8081/realms/jungle-store/.well-known/openid-configuration',
      undefined,
    )
  })

  it('URL オブジェクトも書き換える（パス・クエリは保持）', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok'))
    const f = createKeycloakFetch(PUBLIC, INTERNAL, base as unknown as typeof fetch)

    await f(new URL('http://localhost:8081/realms/jungle-store/protocol/openid-connect/token?x=1'))

    expect(base).toHaveBeenCalledWith(
      'http://keycloak:8081/realms/jungle-store/protocol/openid-connect/token?x=1',
      undefined,
    )
  })

  it('Request オブジェクトの URL を書き換える', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok'))
    const f = createKeycloakFetch(PUBLIC, INTERNAL, base as unknown as typeof fetch)

    await f(new Request('http://localhost:8081/realms/jungle-store/protocol/openid-connect/certs'))

    const arg = base.mock.calls[0][0] as Request
    expect(arg.url).toBe('http://keycloak:8081/realms/jungle-store/protocol/openid-connect/certs')
  })

  it('公開オリジン以外の URL は書き換えない', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok'))
    const f = createKeycloakFetch(PUBLIC, INTERNAL, base as unknown as typeof fetch)

    await f('http://example.com/foo')

    expect(base).toHaveBeenCalledWith('http://example.com/foo', undefined)
  })

  it('init 引数をそのまま渡す', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok'))
    const f = createKeycloakFetch(PUBLIC, INTERNAL, base as unknown as typeof fetch)
    const init = { method: 'POST', body: 'grant_type=authorization_code' }

    await f('http://localhost:8081/token', init)

    expect(base).toHaveBeenCalledWith('http://keycloak:8081/token', init)
  })
})
