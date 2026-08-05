import { createLogger } from '@konnect-demo/shared'
import type { AgentKey } from './conversations.js'

const log = createLogger('agent-service')
const gatewayEndpoint = process.env.GATEWAY_ENDPOINT || 'http://localhost:8000'

export interface AgentSummary {
  key: AgentKey
  name: string
  description: string
  skills: { id: string; name: string; description: string }[]
}

export type DelegateDecision =
  | { kind: 'delegate'; agent: AgentKey }
  | { kind: 'reply'; text: string }

export function buildDelegateTools(agents: AgentSummary[]) {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'delegate',
        description:
          '専門エージェントにユーザー対応を委譲する。商品探し・提案は recommendation、カート追加・数量確認・注文確定は order。',
        parameters: {
          type: 'object',
          properties: {
            agent: { type: 'string', enum: agents.map((a) => a.key) },
          },
          required: ['agent'],
        },
      },
    },
  ]
}

function systemPrompt(agents: AgentSummary[]): string {
  const list = agents
    .map(
      (a) =>
        `- ${a.key}: ${a.name} — ${a.description}（skills: ${a.skills.map((s) => `${s.name}: ${s.description}`).join(' / ')}）`,
    )
    .join('\n')
  return `あなたはジャングルストア（ゴリラテーマの EC サイト）の Shopper エージェントです。
ユーザーの買い物を手伝います。以下の専門エージェントに A2A で委譲できます:
${list}

判断基準:
- 商品を探したい・おすすめを知りたい → delegate(recommendation)
- 特定の商品を買いたい・カートに入れたい・注文したい → delegate(order)
- 挨拶・store に関する一般的な質問 → 自分で簡潔に答える（ツールを呼ばない）
`
}

// Agent Card の skills 記述を LLM に渡し function calling で委譲先を決める。
// LLM は既存エージェントと同じく Kong /ai/agent/v1（キャッシュなし）を経由する。
export async function chooseDelegate(
  message: string,
  agents: AgentSummary[],
  transcript: { speaker: string; text: string }[],
): Promise<DelegateDecision> {
  try {
    const res = await fetch(`${gatewayEndpoint}/ai/agent/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer set-via-kong' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt(agents) },
          ...transcript.map((t) => ({
            role: t.speaker === 'user' ? ('user' as const) : ('assistant' as const),
            content: t.speaker === 'user' ? t.text : `[${t.speaker}] ${t.text}`,
          })),
          { role: 'user', content: message },
        ],
        tools: buildDelegateTools(agents),
      }),
    })
    if (!res.ok) throw new Error(`LLM returned ${res.status}`)
    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: string
          tool_calls?: { function: { name: string; arguments: string } }[]
        }
      }[]
    }
    const msg = data.choices?.[0]?.message
    const call = msg?.tool_calls?.[0]
    if (call?.function.name === 'delegate') {
      const args = JSON.parse(call.function.arguments) as { agent: AgentKey }
      if (agents.some((a) => a.key === args.agent)) {
        return { kind: 'delegate', agent: args.agent }
      }
    }
    if (msg?.content) return { kind: 'reply', text: msg.content }
    throw new Error('empty LLM response')
  } catch (e) {
    log.error({ err: e }, 'chooseDelegate failed; falling back to clarification')
    return {
      kind: 'reply',
      text: 'すみません、うまく聞き取れませんでした。お探しの商品や、したいこと（探す・注文する）を教えてください。',
    }
  }
}
