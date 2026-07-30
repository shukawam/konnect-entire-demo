import { createA2AClient } from '@konnect-demo/a2a-support'
import type { Client } from '@a2a-js/sdk/client'
import { createLogger } from '@konnect-demo/shared'
import type { AgentKey } from './conversations.js'
import type { AgentSummary } from './delegate.js'

const log = createLogger('agent-service')

const AGENT_URLS: Record<AgentKey, string> = {
  recommendation: process.env.A2A_RECOMMENDATION_URL || 'http://localhost:8000/a2a/recommendation',
  order: process.env.A2A_ORDER_URL || 'http://localhost:8000/a2a/orders',
}
const apiKey = process.env.A2A_API_KEY || ''

export class A2AConnectionError extends Error {}

// Kong 経由で Agent Card を取得し A2A クライアントを保持するレジストリ。
// 取得は初回利用時に行い、成功したらキャッシュする（起動順序に依存しない）。
export class AgentRegistry {
  private clients = new Map<AgentKey, Client>()
  private summaries = new Map<AgentKey, AgentSummary>()

  async getClient(key: AgentKey): Promise<Client> {
    const cached = this.clients.get(key)
    if (cached) return cached
    try {
      const client = await createA2AClient(AGENT_URLS[key], apiKey)
      const card = await client.getAgentCard()
      this.clients.set(key, client)
      this.summaries.set(key, {
        key,
        name: card.name,
        description: card.description,
        skills: card.skills.map((s) => ({ id: s.id, name: s.name, description: s.description })),
      })
      return client
    } catch (e) {
      log.error({ err: e, key }, 'failed to connect to A2A agent')
      throw new A2AConnectionError(`A2A agent "${key}" is unavailable`)
    }
  }

  async getSummaries(): Promise<AgentSummary[]> {
    for (const key of Object.keys(AGENT_URLS) as AgentKey[]) {
      await this.getClient(key)
    }
    return [...this.summaries.values()]
  }
}
