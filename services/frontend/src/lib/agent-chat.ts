// Agent モード（A2A オーケストレーション）のクライアント側ヘルパ。
// /api/proxy 経由で agent-service の /api/agent/chat, /api/agent/agents を呼ぶ。

export interface AgentChatResponse {
  conversationId: string
  reply: string
  agent: string
  state: 'completed' | 'input-required' | 'failed'
}

export interface AgentSummary {
  key: string
  name: string
  description: string
  skills: { id: string; name: string; description: string }[]
}

export const AGENT_LABELS: Record<string, string> = {
  shopper: 'Shopper Agent',
  recommendation: 'Recommendation Agent',
  order: 'Order Agent',
}

export function agentBadgeLabel(agent: string): string {
  return AGENT_LABELS[agent] ?? agent
}

export function waitingText(agent: string): string {
  return `${agentBadgeLabel(agent)} が入力を待っています…`
}
