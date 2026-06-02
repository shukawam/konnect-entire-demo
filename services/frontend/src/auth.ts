import NextAuth from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'

// Docker 環境では Keycloak の URL がブラウザ(public)とコンテナ間(internal)で異なる。
// Keycloak は KC_HOSTNAME=public + KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true で起動しており、
// discovery(/.well-known/openid-configuration) を internal から取得すると:
//   - issuer / authorization_endpoint … public(localhost:8081)  ← ブラウザがリダイレクトされる
//   - token / userinfo / jwks_uri      … internal(keycloak:8080) ← サーバー間で到達できる
// が返る。よって wellKnown は internal、issuer(検証用) は public を指定する。
// 詳細は config/keycloak/README.md を参照。
const realm = process.env.KEYCLOAK_REALM ?? 'jungle-store'
const publicUrl = process.env.KEYCLOAK_PUBLIC_URL ?? 'http://localhost:8081'
const internalUrl = process.env.KEYCLOAK_INTERNAL_URL ?? publicUrl

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      // サーバー間で到達できる internal URL から discovery を取得する
      wellKnown: `${internalUrl}/realms/${realm}/.well-known/openid-configuration`,
      // token の iss と一致させるため public URL を指定する
      issuer: `${publicUrl}/realms/${realm}`,
      authorization: { params: { scope: 'openid email profile' } },
    }),
  ],
  callbacks: {
    // Kong へ渡す access_token のみをセッショントークンへ引き継ぐ（id_token は未使用）
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
