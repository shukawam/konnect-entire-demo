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
  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
      }
    : null
  return { user, status }
}
