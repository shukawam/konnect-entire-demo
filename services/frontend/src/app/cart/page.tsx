'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { apiFetch } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface CartItem {
  id: string
  productId: string
  price: number
  quantity: number
}

interface Cart {
  id: string
  items: CartItem[]
}

interface Product {
  id: string
  name: string
}

export default function CartPage() {
  const router = useRouter()
  const [cart, setCart] = useState<Cart | null>(null)
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ordering, setOrdering] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      router.push('/login')
      return
    }
    loadCart()
  }, [])

  async function loadCart() {
    const user = getStoredUser()
    if (!user) return

    try {
      setLoading(true)
      const data = await apiFetch<Cart>('/api/carts', {
        apiKey: user.apiKey,
        userId: user.id,
      })
      setCart(data)

      const ids = [...new Set(data.items.map((i) => i.productId))]
      const names: Record<string, string> = {}
      await Promise.all(
        ids.map(async (id) => {
          try {
            const p = await apiFetch<Product>(`/api/products/${id}`)
            names[id] = p.name
          } catch {
            names[id] = id
          }
        }),
      )
      setProductNames(names)
      window.dispatchEvent(new Event('cart-updated'))
    } catch (err: any) {
      setError(err.message || 'カートの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function updateQuantity(itemId: string, quantity: number) {
    const user = getStoredUser()
    if (!user) return

    try {
      if (quantity <= 0) {
        await apiFetch(`/api/carts/items/${itemId}`, {
          method: 'DELETE',
          apiKey: user.apiKey,
          userId: user.id,
        })
      } else {
        await apiFetch(`/api/carts/items/${itemId}`, {
          method: 'PATCH',
          apiKey: user.apiKey,
          userId: user.id,
          body: JSON.stringify({ quantity }),
        })
      }
      await loadCart()
    } catch (err: any) {
      setError(err.message || '数量の更新に失敗しました')
    }
  }

  async function placeOrder() {
    const user = getStoredUser()
    if (!user) return

    try {
      setOrdering(true)
      const order = await apiFetch<{ id: string }>('/api/orders', {
        method: 'POST',
        apiKey: user.apiKey,
        userId: user.id,
      })
      router.push(`/orders/${order.id}`)
    } catch (err: any) {
      setError(err.message || '注文に失敗しました')
    } finally {
      setOrdering(false)
    }
  }

  const total = cart?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0

  return (
    <>
      <Nav />
      <div className="container">
        <div className="page-header">
          <h1>カート</h1>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <p style={{ padding: '2rem 0' }}>読み込み中...</p>
        ) : !cart || cart.items.length === 0 ? (
          <p style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            カートは空です
          </p>
        ) : (
          <div className="section">
            {cart.items.map((item) => (
              <div key={item.id} className="cart-item">
                <div>
                  <strong>{productNames[item.productId] ?? item.productId}</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {`¥${item.price.toLocaleString()}`} x {item.quantity}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="qty-controls">
                    <button
                      className="qty-btn"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      className="qty-btn"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <span style={{ fontWeight: 'bold', minWidth: '80px', textAlign: 'right' }}>
                    {`¥${(item.price * item.quantity).toLocaleString()}`}
                  </span>
                </div>
              </div>
            ))}

            <div className="cart-total">合計: {`¥${total.toLocaleString()}`}</div>

            <div style={{ textAlign: 'right' }}>
              <button
                className="btn btn-primary"
                onClick={placeOrder}
                disabled={ordering}
                style={{ padding: '0.8rem 2rem', fontSize: '1.1rem' }}
              >
                {ordering ? '注文処理中...' : '注文する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
