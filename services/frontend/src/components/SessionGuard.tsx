'use client'

import { useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'

/**
 * アクセストークンのリフレッシュに失敗（SSO セッション切れ等）したセッションを検知して、
 * 残存する NextAuth の Cookie を破棄する。これがないと「ログインしていないのにユーザー名が
 * 表示される」不整合な Cookie が最大 30 日残り続ける。redirect はしない（現在ページに留まり、
 * UI は useAuthUser 側で未認証表示に切り替わる）。
 */
export default function SessionGuard() {
  const { data: session } = useSession()

  useEffect(() => {
    if (session?.error === 'RefreshTokenError') {
      signOut({ redirect: false })
    }
  }, [session?.error])

  return null
}
