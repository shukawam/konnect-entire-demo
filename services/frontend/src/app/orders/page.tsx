'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { apiFetch } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface Order {
  id: string
  status: string
  totalPrice: number
  createdAt: string
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '保留中',
  CONFIRMED: '確認済み',
  SHIPPED: '発送済み',
  DELIVERED: '配達完了',
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      router.push('/login')
      return
    }
    loadOrders()
  }, [])

  async function loadOrders() {
    const user = getStoredUser()
    if (!user) return

    try {
      setLoading(true)
      const data = await apiFetch<Order[]>('/api/orders', {
        apiKey: user.apiKey,
        userId: user.id,
      })
      setOrders(data)
    } catch (err: any) {
      setError(err.message || '注文履歴の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Nav />
      <div className="container">
        <div className="page-header">
          <h1>注文履歴</h1>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <p style={{ padding: '2rem 0' }}>読み込み中...</p>
        ) : orders.length === 0 ? (
          <p style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            注文履歴がありません
          </p>
        ) : (
          <div className="section">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="order-card" style={{ cursor: 'pointer' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        注文番号: {order.id}
                      </p>
                      <p
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--text-muted)',
                          marginTop: '0.25rem',
                        }}
                      >
                        {new Date(order.createdAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className={`status-badge status-${order.status}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginTop: '0.5rem' }}>
                        {`¥${order.totalPrice.toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
