'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { apiFetch } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface Product {
  id: string
  name: string
  price: number
  category: string
  description?: string
  imageUrl?: string
}

export default function HomePage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addingToCart, setAddingToCart] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    try {
      setLoading(true)
      const data = await apiFetch<{ products: Product[]; total: number }>('/api/products')
      setProducts(data.products)
      const cats = Array.from(new Set(data.products.map((p) => p.category)))
      setCategories(cats)
    } catch (err: any) {
      setError(err.message || '商品の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function addToCart(product: Product) {
    const user = getStoredUser()
    if (!user) {
      router.push('/login')
      return
    }

    try {
      setAddingToCart(product.id)
      await apiFetch('/api/carts/items', {
        method: 'POST',
        apiKey: user.apiKey,
        userId: user.id,
        body: JSON.stringify({ productId: product.id, quantity: 1, price: product.price }),
      })
      window.dispatchEvent(new Event('cart-updated'))
      setToast('カートに追加しました')
      setTimeout(() => setToast(''), 2000)
    } catch (err: any) {
      setError(err.message || 'カートへの追加に失敗しました')
    } finally {
      setAddingToCart(null)
    }
  }

  const filteredProducts =
    selectedCategory === 'all' ? products : products.filter((p) => p.category === selectedCategory)

  return (
    <>
      <Nav />
      <div className="container">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="filter-bar">
          <button
            className={`filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            すべて
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ padding: '2rem 0' }}>読み込み中...</p>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <div key={product.id} className="card">
                {product.imageUrl && (
                  <div className="card-image">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                )}
                <div className="card-body">
                  <span className="card-category">{product.category}</span>
                  <h3 className="card-title">{product.name}</h3>
                  {product.description && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      {product.description}
                    </p>
                  )}
                  <p className="card-price">{`¥${product.price.toLocaleString()}`}</p>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => addToCart(product)}
                    disabled={addingToCart === product.id}
                  >
                    {addingToCart === product.id ? '追加中...' : 'カートに追加'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredProducts.length === 0 && (
          <p style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            商品が見つかりませんでした
          </p>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
