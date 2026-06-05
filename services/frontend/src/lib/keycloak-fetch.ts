/**
 * フロントチャネル（ブラウザ）とバックチャネル（コンテナ）で Keycloak の到達 URL を分離するための
 * fetch ラッパー。Auth.js v5 の `getAuthorizationUrl` は `wellKnown` を無視し `issuer` から
 * discovery をサーバー側で fetch するため、`issuer` をブラウザ用 URL（publicUrl）に保ったまま、
 * サーバー側の fetch 先（discovery / token / jwks / userinfo）だけを内部 URL（internalUrl）へ
 * 書き換える。ブラウザへ返す authorization_endpoint は publicUrl のままなので /etc/hosts は不要。
 */
export function createKeycloakFetch(
  publicUrl: string,
  internalUrl: string,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  const publicOrigin = new URL(publicUrl).origin
  const internalOrigin = new URL(internalUrl).origin

  const rewrite = (url: string) =>
    url.startsWith(publicOrigin) ? internalOrigin + url.slice(publicOrigin.length) : url

  return (input, init) => {
    if (typeof input === 'string') return baseFetch(rewrite(input), init)
    if (input instanceof URL) return baseFetch(rewrite(input.href), init)
    return baseFetch(new Request(rewrite(input.url), input), init)
  }
}
