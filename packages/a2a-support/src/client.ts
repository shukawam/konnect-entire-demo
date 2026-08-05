import {
  ClientFactory,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  type Client,
} from '@a2a-js/sdk/client'

// Kong の key-auth（apikey ヘッダー）を透過するため fetch をラップする。
function apiKeyFetch(apiKey?: string): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...((init?.headers as Record<string, string>) ?? {}),
        ...(apiKey ? { apikey: apiKey } : {}),
      },
    })
}

// SDK の card resolver は相対パス `.well-known/agent-card.json` を baseUrl から解決するため、
// 末尾スラッシュがないと最後のセグメントが欠落する（`/a2a/recommendation` →
// `/a2a/.well-known/agent-card.json`）。カード取得 URL だけ末尾スラッシュを補う。
function cardBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

// legacyCompat: サーバーは v0.3 形式カード + v0.3 JSON-RPC（Kong ai-a2a-proxy の検出対象)。
export function createA2AClientFactory(apiKey?: string): ClientFactory {
  const fetchImpl = apiKeyFetch(apiKey)
  return new ClientFactory({
    cardResolver: new DefaultAgentCardResolver({ fetchImpl, legacyCompat: { enabled: true } }),
    transports: [new JsonRpcTransportFactory({ fetchImpl, legacyCompat: { enabled: true } })],
  })
}

export async function createA2AClient(baseUrl: string, apiKey?: string): Promise<Client> {
  const resolver = new DefaultAgentCardResolver({
    fetchImpl: apiKeyFetch(apiKey),
    legacyCompat: { enabled: true },
  })
  const card = await resolver.resolve(cardBaseUrl(baseUrl))
  // SDK は Agent Card の supportedInterfaces[].url をそのまま RPC 送信先にする。専門エージェントは
  // カードに自身の内部 URL（SELF_URL）を載せるため、そのままだと Kong を迂回して直接呼んでしまい
  // key-auth / acl / ai-a2a-proxy のテレメトリを通らない。送信先を設定 URL（= Kong ルート）で固定する。
  // カードの他フィールド（name / description / skills）はオーケストレータのレジストリが使うため保持する。
  return createA2AClientFactory(apiKey).createFromAgentCard({
    ...card,
    supportedInterfaces: (card.supportedInterfaces ?? []).map((i) => ({ ...i, url: baseUrl })),
  })
}
