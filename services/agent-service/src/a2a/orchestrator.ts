import { TaskState, type Task } from '@a2a-js/sdk'
import { userMessage, replyTextOf } from '@konnect-demo/a2a-support'
import { createLogger } from '@konnect-demo/shared'
import { ConversationStore, type AgentKey, type Conversation } from './conversations.js'
import type { AgentRegistry } from './registry.js'
import { chooseDelegate as defaultChooseDelegate, type AgentSummary } from './delegate.js'

const log = createLogger('agent-service')

// 新規委譲時に前置する会話履歴の最大件数（最新のユーザー発話を除く直近分）
const CONTEXT_TURNS = 8

// 専門エージェントは会話履歴を持たないため、新規タスク開始時のみ直前までの会話を前置する。
// 例: recommendation がどの商品を提案したかを order が知らないと productId / 金額に到達できない。
// resume 時はタスク自身が履歴を持つので前置しない（重複を避ける）。
function withContext(transcript: Conversation['transcript'], message: string): string {
  // 直前に append 済みの最新ユーザー発話は「依頼」として別に載せるため履歴から除く
  const history = transcript.slice(0, -1).slice(-CONTEXT_TURNS)
  if (history.length === 0) return message
  const lines = history.map((t) => `${t.speaker}: ${t.text}`).join('\n')
  return `これまでの会話:\n${lines}\n\n依頼: ${message}`
}

export interface ChatInput {
  conversationId?: string
  message: string
  userId: string
}

export interface ChatOutput {
  conversationId: string
  reply: string
  agent: 'shopper' | AgentKey
  state: 'completed' | 'input-required' | 'failed'
}

type ChooseDelegate = typeof defaultChooseDelegate

export class Orchestrator {
  constructor(
    private readonly store: ConversationStore,
    private readonly registry: Pick<AgentRegistry, 'getClient' | 'getSummaries'>,
    private readonly choose: ChooseDelegate = defaultChooseDelegate,
  ) {}

  async handleChat(input: ChatInput): Promise<ChatOutput> {
    const conv = this.store.getOrCreate(input.conversationId, input.userId)
    this.store.append(conv, 'user', input.message)

    // 保留中タスクがあれば委譲判断をスキップし同一タスクを再開する
    if (conv.pending) {
      return this.sendToAgent(conv, conv.pending.agentKey, input.message, {
        taskId: conv.pending.taskId,
        contextId: conv.pending.contextId,
      })
    }

    const agents = await this.registry.getSummaries()
    // 直前に append した user 発話は message として別に渡すため transcript から除く
    const decision = await this.choose(input.message, agents, conv.transcript.slice(0, -1))
    if (decision.kind === 'reply') {
      this.store.append(conv, 'shopper', decision.text)
      return { conversationId: conv.id, reply: decision.text, agent: 'shopper', state: 'completed' }
    }
    return this.sendToAgent(conv, decision.agent, withContext(conv.transcript, input.message), {})
  }

  private async sendToAgent(
    conv: Conversation,
    agentKey: AgentKey,
    text: string,
    resume: { taskId?: string; contextId?: string },
  ): Promise<ChatOutput> {
    let result: Task
    try {
      const client = await this.registry.getClient(agentKey)
      result = (await client.sendMessage({
        message: userMessage(text, { ...resume, userId: conv.userId }),
        configuration: undefined,
        metadata: undefined,
        tenant: '',
      })) as Task
    } catch (e) {
      // 保留タスクの再開が失敗した場合（専門エージェントが再起動して taskId を失った等）は
      // pending を解除する。そうしないと以降のターンも同じ再開を試み続け会話が詰まる。
      // 次のユーザー発話では改めて委譲判断が走り、新規タスクとして自然に復帰できる。
      if (resume.taskId) {
        log.warn(
          { err: e, agentKey, taskId: resume.taskId },
          'failed to resume A2A task; clearing pending so the next turn starts a new task',
        )
        this.store.clearPending(conv)
      }
      throw e
    }

    const reply = replyTextOf(result) || '応答を取得できませんでした。'
    const state = result.status?.state
    let mapped: ChatOutput['state']
    if (state === TaskState.TASK_STATE_INPUT_REQUIRED) {
      this.store.setPending(conv, { agentKey, taskId: result.id, contextId: result.contextId })
      mapped = 'input-required'
    } else if (state === TaskState.TASK_STATE_COMPLETED) {
      this.store.clearPending(conv)
      mapped = 'completed'
    } else {
      log.warn({ state, agentKey }, 'A2A task ended in non-success state')
      this.store.clearPending(conv)
      mapped = 'failed'
    }
    this.store.append(conv, agentKey, reply)
    return { conversationId: conv.id, reply, agent: agentKey, state: mapped }
  }

  async listAgents(): Promise<AgentSummary[]> {
    return this.registry.getSummaries()
  }
}
