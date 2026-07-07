import { describe, it, expect } from 'vitest'
import app from '../routes.js'

// 認証は Keycloak SSO + Kong openid-connect が担い、Kong が claim を
// X-User-Id / X-User-Email / X-User-Name ヘッダーとして注入する。

describe('GET /me', () => {
  it('X-User-Id ヘッダーがない場合 401 を返す', async () => {
    const res = await app.request('/me', { method: 'GET' })
    expect(res.status).toBe(401)
  })

  it('Kong が注入した claim ヘッダーからプロフィールを返す', async () => {
    const res = await app.request('/me', {
      method: 'GET',
      headers: {
        'X-User-Id': 'kc-sub-123',
        'X-User-Email': 'jack@example.com',
        'X-User-Name': 'jack',
      },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: 'kc-sub-123',
      email: 'jack@example.com',
      name: 'jack',
    })
  })

  it('email / name ヘッダーが無くても id だけで 200 を返す', async () => {
    const res = await app.request('/me', {
      method: 'GET',
      headers: { 'X-User-Id': 'kc-sub-456' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: 'kc-sub-456', email: '', name: '' })
  })
})
