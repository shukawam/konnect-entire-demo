import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    /** アクセストークンのリフレッシュに失敗した場合に 'RefreshTokenError' が入る */
    error?: string
    user: {
      id: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    /** アクセストークンの有効期限（エポック秒） */
    expiresAt?: number
    /** リフレッシュ不能時に 'RefreshTokenError' が入る */
    error?: string
  }
}
