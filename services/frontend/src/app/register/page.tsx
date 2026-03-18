'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { apiFetch } from '@/lib/api'
import { storeUser } from '@/lib/auth'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
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
      }>('/api/users/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      })

      storeUser({
        id: data.id,
        email: data.email,
        name: data.name,
        apiKey: data.apiKey,
      })

      router.push('/')
    } catch (err: any) {
      setError(err.message || '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Nav />
      <div className="container">
        <div className="auth-form">
          <h1>新規登録</h1>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>お名前</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="山田 太郎"
              />
            </div>
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
                minLength={6}
                placeholder="6文字以上"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? '登録中...' : '登録する'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '1rem' }}>
            すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
          </p>
        </div>
      </div>
    </>
  )
}
