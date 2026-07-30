import {
  ClientFactory,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  type Client,
} from '@a2a-js/sdk/client'

// Kong の key-auth（apikey ヘッダー）を透過するため fetch をラップする。
// legacyCompat: サーバーは v0.3 形式カード + v0.3 JSON-RPC（Kong ai-a2a-proxy の検出対象)。
export function createA2AClientFactory(apiKey?: string): ClientFactory {
  const fetchImpl: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...((init?.headers as Record<string, string>) ?? {}),
        ...(apiKey ? { apikey: apiKey } : {}),
      },
    })
  return new ClientFactory({
    cardResolver: new DefaultAgentCardResolver({ fetchImpl, legacyCompat: { enabled: true } }),
    transports: [new JsonRpcTransportFactory({ fetchImpl, legacyCompat: { enabled: true } })],
  })
}

export async function createA2AClient(baseUrl: string, apiKey?: string): Promise<Client> {
  return createA2AClientFactory(apiKey).createFromUrl(baseUrl)
}
