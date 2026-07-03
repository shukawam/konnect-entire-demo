import NextAuth, { customFetch } from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'
import { createKeycloakFetch } from '@/lib/keycloak-fetch'

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
    // Kong へ渡す access_token のみをセッショントークンへ引き継ぐ
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token
      }
      if (profile?.sub) token.sub = profile.sub
      return token
    },
    // proxy が Kong へ渡せるよう accessToken を、UI 表示用に user.id(sub) を公開する
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined
      if (session.user) session.user.id = token.sub ?? ''
      return session
    },
  },
})
