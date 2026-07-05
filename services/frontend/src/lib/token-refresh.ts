/**
 * Keycloak アクセストークンのライフサイクル管理。
 *
 * NextAuth のセッション Cookie（既定 30 日）は Keycloak のアクセストークン（既定 5 分）より
 * 遥かに長寿命なため、何もしないとトークン失効後もセッションだけが生き残り「ログインしている
 * ように見えて実際は未認証」という不整合が起きる。ここで expires_at を監視し、失効時は
 * refresh_token で更新、更新不能なら error を立てて session 側で未認証扱いに落とす。
 *
 * auth.ts の jwt コールバックから利用する純粋関数として切り出し、NextAuth 非依存で単体テスト
 * できるようにしている。
 */

// 失効ギリギリのトークンを掴まないための事前更新マージン（秒）
const EXPIRY_MARGIN_SEC = 30

export interface RefreshableToken {
  accessToken?: string
  refreshToken?: string
  /** アクセストークンの有効期限（エポック秒） */
  expiresAt?: number
  /** リフレッシュ不能時に設定。session 側でこれを見て未認証扱いにする */
  error?: string
  [key: string]: unknown
}

export interface RefreshOptions {
  tokenEndpoint: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
  /** テスト用の現在時刻(ms)。既定は Date.now() */
  now?: number
}

/**
 * アクセストークンがまだ有効か（マージン込み）を判定する。
 * expiresAt が無い場合は判定不能なので false（＝更新を促す）。
 */
export function isAccessTokenValid(token: RefreshableToken, now: number = Date.now()): boolean {
  if (!token.expiresAt) return false
  return now < token.expiresAt * 1000 - EXPIRY_MARGIN_SEC * 1000
}

/**
 * refresh_token を使って Keycloak からアクセストークンを再取得する。
 * 更新できない（refresh_token なし / 失効 / 通信エラー）場合は error を立てて返す。
 * 例外は投げず、常に更新後トークンを解決する（jwt コールバックを壊さないため）。
 */
export async function refreshAccessToken(
  token: RefreshableToken,
  opts: RefreshOptions,
): Promise<RefreshableToken> {
  const { tokenEndpoint, clientId, clientSecret, fetchImpl = fetch, now = Date.now() } = opts

  if (!token.refreshToken) {
    return { ...token, error: 'RefreshTokenError' }
  }

  try {
    const res = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refreshToken,
      }),
    })

    const refreshed = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      error?: string
    }

    // expires_in が無い/非正なら expiresAt が現在時刻となり毎リクエストで再更新が走る
    // （Keycloak を叩き続けるループ）ため、異常応答として扱い error に落とす。
    if (!res.ok || !refreshed.access_token || !refreshed.expires_in || refreshed.expires_in <= 0) {
      throw new Error(refreshed.error ?? `refresh failed: ${res.status}`)
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      // Keycloak はローテーションで新しい refresh_token を返すことがある。無ければ現行を維持。
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(now / 1000) + refreshed.expires_in,
      error: undefined,
    }
  } catch {
    // refresh_token の失効（SSO セッション切れ等）を含む。session 側で未認証に落とす。
    return { ...token, error: 'RefreshTokenError' }
  }
}
