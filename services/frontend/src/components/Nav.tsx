'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { useAuthUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import GrafanaIcon from '@/components/GrafanaIcon'
import ThemeToggle from '@/components/ThemeToggle'

export default function Nav() {
  const pathname = usePathname()
  const { user } = useAuthUser()
  const [cartCount, setCartCount] = useState(0)
  const grafanaUrl = process.env.NEXT_PUBLIC_GRAFANA_URL ?? 'http://localhost:3010'

  const fetchCartCount = useCallback(async () => {
    if (!user) {
      setCartCount(0)
      return
    }
    try {
      const cart = await apiFetch<{ items: { quantity: number }[] }>('/api/carts')
      setCartCount(cart.items.reduce((sum, i) => sum + i.quantity, 0))
    } catch {
      setCartCount(0)
    }
  }, [user])

  useEffect(() => {
    fetchCartCount()
    const handler = () => fetchCartCount()
    window.addEventListener('cart-updated', handler)
    return () => window.removeEventListener('cart-updated', handler)
  }, [fetchCartCount])

  const handleLogout = () => {
    signOut({ callbackUrl: '/' })
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          🦍 Jungle <span>Shop</span>
        </Link>
        <div className="nav-links">
          <Link href="/" className={pathname === '/' ? 'nav-active' : ''}>
            ホーム
          </Link>
          <Link href="/cart" className={`cart-link${pathname === '/cart' ? ' nav-active' : ''}`}>
            カート{cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </Link>
          <Link href="/orders" className={pathname.startsWith('/orders') ? 'nav-active' : ''}>
            注文履歴
          </Link>
          <a
            href={grafanaUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <GrafanaIcon />
            Grafana
          </a>
          {user && (
            <button
              type="button"
              className="nav-icon-btn nav-ask-ai"
              data-ask-ai-trigger
              onClick={() => window.dispatchEvent(new Event('ask-ai-toggle'))}
              aria-label="AI に質問"
            >
              ✨ Ask AI
            </button>
          )}
          <ThemeToggle />
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
