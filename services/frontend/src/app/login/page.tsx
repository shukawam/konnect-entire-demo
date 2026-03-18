'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { apiFetch } from '@/lib/api'
import { storeUser } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await apiFetch<{
        id: string
        email: string
        name: string
        apiKey: string
      }>('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      storeUser({
        id: data.id,
        email: data.email,
        name: data.name,
        apiKey: data.apiKey,
      })

      router.push('/')
    } catch (err: any) {
      setError(err.message || 'ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Nav />
      <div className="container">
        <div className="auth-form">
          <h1>ログイン</h1>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="example@mail.com"
              />
            </div>
            <div className="form-group">
              <label>パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="パスワードを入力"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '1rem' }}>
            アカウントをお持ちでない方は <Link href="/register">新規登録</Link>
          </p>
        </div>
      </div>
    </>
  )
}
