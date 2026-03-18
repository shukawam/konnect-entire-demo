import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch } from '../api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  it('calls fetch with correct URL and default headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'test' }),
    })

    const result = await apiFetch('/api/products')

    expect(result).toEqual({ data: 'test' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/proxy/api/products')
    expect(options.headers['Content-Type']).toBe('application/json')
    // traceparent may be undefined if crypto.getRandomValues is unavailable in test env
    // The header is generated at runtime in the browser
  })

  it('includes apiKey header when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await apiFetch('/api/carts', { apiKey: 'my-key' })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['apikey']).toBe('my-key')
  })

  it('includes X-User-Id header when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await apiFetch('/api/carts', { userId: 'user-1' })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['X-User-Id']).toBe('user-1')
  })

  it('passes method and body through', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await apiFetch('/api/carts/items', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', quantity: 1 }),
    })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.body).toBe(JSON.stringify({ productId: 'p1', quantity: 1 }))
  })

  it('throws error with message from response body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Cart is empty' }),
    })

    await expect(apiFetch('/api/orders')).rejects.toThrow('Cart is empty')
  })

  it('throws generic error when response has no error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    await expect(apiFetch('/api/orders')).rejects.toThrow('サーバーでエラーが発生しました')
  })

  it('throws generic error when response body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      },
    })

    await expect(apiFetch('/api/orders')).rejects.toThrow('サーバーに接続できませんでした')
  })
})
