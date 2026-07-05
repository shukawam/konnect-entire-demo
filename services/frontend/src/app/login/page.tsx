'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useAuthUser } from '@/lib/auth'
import Nav from '@/components/Nav'

export default function LoginPage() {
  const router = useRouter()
  // useAuthUser は RefreshTokenError のセッションを unauthenticated として扱うため、
  // 失効ユーザーが /login に来ても / へ跳ね返さず再ログインできる。
  const { status } = useAuthUser()

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
