import { TaskState, type Task } from '@a2a-js/sdk'
import { userMessage, replyTextOf } from '@konnect-demo/a2a-support'
import { createLogger } from '@konnect-demo/shared'
import { ConversationStore, type AgentKey, type Conversation } from './conversations.js'
import type { AgentRegistry } from './registry.js'
import { chooseDelegate as defaultChooseDelegate, type AgentSummary } from './delegate.js'

const log = createLogger('agent-service')

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
    return this.sendToAgent(conv, decision.agent, input.message, {})
  }

  private async sendToAgent(
    conv: Conversation,
    agentKey: AgentKey,
    text: string,
    resume: { taskId?: string; contextId?: string },
  ): Promise<ChatOutput> {
    const client = await this.registry.getClient(agentKey)
    const result = (await client.sendMessage({
      message: userMessage(text, { ...resume, userId: conv.userId }),
      configuration: undefined,
      metadata: undefined,
      tenant: '',
    })) as Task

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
