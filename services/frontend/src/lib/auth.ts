'use client'

import { useSession } from 'next-auth/react'

export interface AuthUser {
  id: string
  email: string
  name: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/**
 * Keycloak SSO のセッションから現在のユーザーを取得する。
 * 認証は NextAuth(Auth.js) が管理し、バックエンドへの Bearer トークン付与は
 * /api/proxy がサーバー側で行う（クライアントはトークンを扱わない）。
 */
export function useAuthUser(): { user: AuthUser | null; status: AuthStatus } {
  const { data: session, status } = useSession()
  // アクセストークンのリフレッシュに失敗したセッションは「見た目はログイン中だが実体は
  // 未認証」の状態。UI 上は未認証として扱い、ユーザー名を表示しない。
  const errored = session?.error === 'RefreshTokenError'
  const user =
    session?.user && !errored
      ? {
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.name ?? '',
        }
      : null
  const effectiveStatus: AuthStatus = errored ? 'unauthenticated' : status
  return { user, status: effectiveStatus }
}
