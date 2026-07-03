const API_BASE = '/api/proxy'

function friendlyMessage(status: number): string {
  switch (status) {
    case 400:
      return 'リクエストの内容に問題があります'
    case 401:
      return 'ログインが必要です。再度ログインしてください'
    case 403:
      return 'この操作を行う権限がありません'
    case 404:
      return 'お探しの情報が見つかりませんでした'
    case 409:
      return 'データが競合しています。ページを更新してください'
    case 429:
      return 'リクエストが多すぎます。しばらくしてから再度お試しください'
    case 500:
      return 'サーバーでエラーが発生しました。しばらくしてから再度お試しください'
    case 502:
      return 'サーバーに接続できませんでした。しばらくしてから再度お試しください'
    case 503:
      return 'サービスが一時的に利用できません。しばらくしてから再度お試しください'
    default:
      return 'エラーが発生しました。しばらくしてから再度お試しください'
  }
}

// 認証は /api/proxy がセッションの access_token を Authorization: Bearer として
// サーバー側で付与する。クライアントは API キーやユーザー ID を扱わない。
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers: customHeaders, ...rest } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...rest,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || friendlyMessage(res.status))
  }

  return res.json()
}
