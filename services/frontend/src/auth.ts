import NextAuth, { customFetch } from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'
import { createKeycloakFetch } from '@/lib/keycloak-fetch'
import { isAccessTokenValid, refreshAccessToken } from '@/lib/token-refresh'

// フロントチャネル（ブラウザ）とバックチャネル（コンテナ）で Keycloak の到達 URL を分離する。
//   - issuer: token の iss / 認可エンドポイントに使う「ブラウザが到達する」URL（localhost:8081）。
//   - customFetch: Auth.js がサーバー側で行う discovery / token / jwks / userinfo の取得だけを
//     「コンテナが到達する」内部 URL（keycloak:8081）へ書き換える。ブラウザへ返す
//     authorization_endpoint は localhost:8081 のままなので /etc/hosts への追記が不要になる。
// Auth.js v5 の getAuthorizationUrl は wellKnown を無視し provider.issuer から discovery を
// fetch するため、issuer をブラウザ用 URL に保ったまま fetch だけ内部 URL へ振り替えるのが要点。
// Kong 側は KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true により jwks を keycloak:8081 で取得できる。
// 詳細は config/keycloak/README.md を参照。
const realm = process.env.KEYCLOAK_REALM ?? 'jungle-store'
const publicUrl = process.env.KEYCLOAK_PUBLIC_URL ?? 'http://localhost:8081'
const internalUrl = process.env.KEYCLOAK_INTERNAL_URL ?? 'http://keycloak:8081'

// 公開オリジン宛のサーバー側リクエストだけ内部オリジンへ書き換える fetch。
const keycloakFetch = createKeycloakFetch(publicUrl, internalUrl)

// リフレッシュはサーバー(コンテナ)→ Keycloak の直接通信なので内部 URL を使う。
const tokenEndpoint = `${internalUrl}/realms/${realm}/protocol/openid-connect/token`

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: `${publicUrl}/realms/${realm}`,
      authorization: { params: { scope: 'openid email profile' } },
      [customFetch]: keycloakFetch,
    }),
  ],
  callbacks: {
    // アクセストークンのライフサイクルを Keycloak に追従させる。
    async jwt({ token, account, profile }) {
      // 初回サインイン: account からトークン一式を取り込む
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at // エポック秒
        token.error = undefined
        if (profile?.sub) token.sub = profile.sub
        return token
      }
      // 有効期限内ならそのまま
      if (isAccessTokenValid(token)) return token
      // 失効: refresh_token で更新（不能なら error が立ち session 側で未認証に落ちる）。
      // 注: 並列リクエストで同時実行されると同じ refresh_token を独立に使う。現在の realm 設定
      // （config/keycloak/realm-export.json: revokeRefreshToken=false）では再利用可能なため安全。
      // リフレッシュトークンローテーションを有効化する場合は先勝ち以外が invalid_grant で
      // 誤サインアウトしうるので、更新の直列化・ミューテックスが必要になる。
      return refreshAccessToken(token, {
        tokenEndpoint,
        clientId: process.env.AUTH_KEYCLOAK_ID ?? '',
        clientSecret: process.env.AUTH_KEYCLOAK_SECRET ?? '',
      })
    },
    // proxy が Kong へ渡せるよう accessToken を、UI 表示用に user.id(sub) を公開する。
    // リフレッシュ失敗時は error を伝播し、クライアント側で未認証扱い＆サインアウトさせる。
    async session({ session, token }) {
      // リフレッシュ不能時は失効済みアクセストークンを proxy に渡さない（Kong へ送っても
      // 401 になるだけなので、error のみ伝播して SessionGuard に signOut を委ねる）。
      session.accessToken = token.error ? undefined : (token.accessToken as string | undefined)
      session.error = token.error as string | undefined
      if (session.user) session.user.id = token.sub ?? ''
      return session
    },
  },
})
