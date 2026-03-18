'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { apiFetch } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface OrderItem {
  id: string
  productId: string
  price: number
  quantity: number
}

interface Order {
  id: string
  status: string
  totalPrice: number
  items: OrderItem[]
  createdAt: string
}

interface Shipment {
  id: string
  status: string
  trackingNumber?: string
  carrier?: string
  estimatedDelivery?: string
  shippedAt?: string
  deliveredAt?: string
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '保留中',
  CONFIRMED: '確認済み',
  SHIPPED: '発送済み',
  DELIVERED: '配達完了',
}

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  PROCESSING: '準備中',
  SHIPPED: '発送済み',
  IN_TRANSIT: '配送中',
  DELIVERED: '配達完了',
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      router.push('/login')
      return
    }
    loadOrderDetail()
  }, [orderId])

  async function loadOrderDetail() {
    const user = getStoredUser()
    if (!user) return

    try {
      setLoading(true)

      const [orderData, shipmentData] = await Promise.allSettled([
        apiFetch<Order>(`/api/orders/${orderId}`, { apiKey: user.apiKey, userId: user.id }),
        apiFetch<Shipment>(`/api/shipments/order/${orderId}`, {
          apiKey: user.apiKey,
          userId: user.id,
        }),
      ])

      if (orderData.status === 'fulfilled') {
        setOrder(orderData.value)

        const ids = [...new Set(orderData.value.items.map((i) => i.productId))]
        const names: Record<string, string> = {}
        await Promise.all(
          ids.map(async (id) => {
            try {
              const p = await apiFetch<{ id: string; name: string }>(`/api/products/${id}`)
              names[id] = p.name
            } catch {
              names[id] = id
            }
          }),
        )
        setProductNames(names)
      } else {
        setError('注文情報の読み込みに失敗しました')
      }

      if (shipmentData.status === 'fulfilled') {
        setShipment(shipmentData.value)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Nav />
      <div className="container">
        <div className="page-header">
          <Link href="/orders" style={{ fontSize: '0.9rem' }}>
            &larr; 注文履歴に戻る
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>注文詳細</h1>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <p style={{ padding: '2rem 0' }}>読み込み中...</p>
        ) : order ? (
          <div className="section">
            <div className="order-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
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
                    注文日: {new Date(order.createdAt).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <span className={`status-badge status-${order.status}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--glass-border)',
                  margin: '1rem 0',
                }}
              />

              <h3 style={{ marginBottom: '0.75rem' }}>注文商品</h3>
              {order.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                >
                  <div>
                    <span>{productNames[item.productId] ?? item.productId}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      x{item.quantity}
                    </span>
                  </div>
                  <span style={{ fontWeight: 'bold' }}>
                    {`¥${(item.price * item.quantity).toLocaleString()}`}
                  </span>
                </div>
              ))}

              <div
                style={{
                  textAlign: 'right',
                  marginTop: '1rem',
                  fontSize: '1.3rem',
                  fontWeight: 'bold',
                }}
              >
                合計: {`¥${order.totalPrice.toLocaleString()}`}
              </div>
            </div>

            {shipment && (
              <div className="order-card">
                <h3 style={{ marginBottom: '0.75rem' }}>配送情報</h3>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>配送ステータス</span>
                    <span className={`status-badge status-${shipment.status}`}>
                      {SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
                    </span>
                  </div>
                  {shipment.carrier && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>配送業者</span>
                      <span>{shipment.carrier}</span>
                    </div>
                  )}
                  {shipment.trackingNumber && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>追跡番号</span>
                      <span>{shipment.trackingNumber}</span>
                    </div>
                  )}
                  {shipment.estimatedDelivery && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>配達予定日</span>
                      <span>
                        {new Date(shipment.estimatedDelivery).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                  )}
                  {shipment.shippedAt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>発送日</span>
                      <span>{new Date(shipment.shippedAt).toLocaleDateString('ja-JP')}</span>
                    </div>
                  )}
                  {shipment.deliveredAt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>配達日</span>
                      <span>{new Date(shipment.deliveredAt).toLocaleDateString('ja-JP')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            注文が見つかりませんでした
          </p>
        )}
      </div>
    </>
  )
}
