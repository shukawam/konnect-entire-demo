'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { getStoredUser, clearUser, type AuthUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

export default function Nav() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [cartCount, setCartCount] = useState(0)

  const fetchCartCount = useCallback(async () => {
    const u = getStoredUser()
    if (!u) {
      setCartCount(0)
      return
    }
    try {
      const cart = await apiFetch<{ items: { quantity: number }[] }>('/api/carts', {
        apiKey: u.apiKey,
        userId: u.id,
      })
      setCartCount(cart.items.reduce((sum, i) => sum + i.quantity, 0))
    } catch {
      setCartCount(0)
    }
  }, [])

  useEffect(() => {
    setUser(getStoredUser())
    fetchCartCount()
    const handler = () => fetchCartCount()
    window.addEventListener('cart-updated', handler)
    return () => window.removeEventListener('cart-updated', handler)
  }, [fetchCartCount])

  const handleLogout = () => {
    clearUser()
    setUser(null)
    router.push('/')
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          🦍 Jungle <span>Shop</span>
        </Link>
        <div className="nav-links">
          <Link href="/" className={pathname === '/' ? 'nav-active' : ''}>
            🏠ホーム
          </Link>
          <Link href="/cart" className={`cart-link${pathname === '/cart' ? ' nav-active' : ''}`}>
            🛒カート{cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </Link>
          <Link href="/orders" className={pathname.startsWith('/orders') ? 'nav-active' : ''}>
            📦注文履歴
          </Link>
          {user ? (
            <>
              <span
                style={{ color: 'var(--secondary-dark)', fontWeight: 600, fontSize: '0.92rem' }}
              >
                {user.name}
              </span>
              <button onClick={handleLogout} className="btn btn-sm btn-ghost">
                ログアウト
              </button>
            </>
          ) : (
            <Link href="/login" style={{ color: 'var(--secondary)', fontWeight: 600 }}>
              ログイン
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
