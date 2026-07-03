'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import Nav from '@/components/Nav'

export default function LoginPage() {
  const router = useRouter()
  const { status } = useSession()

  // 既にログイン済みならトップへ
  useEffect(() => {
    if (status === 'authenticated') router.push('/')
  }, [status, router])

  return (
    <>
      <Nav />
      <div className="container">
        <div className="auth-form">
          <h1>ログイン</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Keycloak アカウントでログインします
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={status === 'loading'}
            onClick={() => signIn('keycloak', { callbackUrl: '/' })}
          >
            {status === 'loading' ? '読み込み中...' : 'Keycloak でログイン'}
          </button>
        </div>
      </div>
    </>
  )
}
