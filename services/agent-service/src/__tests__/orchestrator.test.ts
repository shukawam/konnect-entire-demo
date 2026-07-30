import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskState } from '@a2a-js/sdk'

// 失敗ステートの中継は意図的に log.warn を通るため、テスト出力を汚さないよう logger を無効化する
vi.mock('@konnect-demo/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { Orchestrator } from '../a2a/orchestrator.js'
import { ConversationStore } from '../a2a/conversations.js'
import { agentMessage } from '@konnect-demo/a2a-support'

function taskResult(state: TaskState, text: string, id = 'task-1', contextId = 'ctx-1') {
  return {
    id,
    contextId,
    status: { state, message: agentMessage(id, contextId, text), timestamp: undefined },
    artifacts: [],
    history: [],
    metadata: undefined,
  }
}

describe('Orchestrator', () => {
  let sendMessage: ReturnType<typeof vi.fn>
  let registry: any
  let chooseDelegate: ReturnType<typeof vi.fn>
  let orchestrator: Orchestrator

  beforeEach(() => {
    sendMessage = vi.fn()
    registry = {
      getClient: vi.fn().mockResolvedValue({ sendMessage }),
      getSummaries: vi.fn().mockResolvedValue([]),
    }
    chooseDelegate = vi.fn()
    orchestrator = new Orchestrator(new ConversationStore(), registry, chooseDelegate)
  })

  it('委譲判断が reply なら shopper が直接応答する', async () => {
    chooseDelegate.mockResolvedValue({ kind: 'reply', text: 'こんにちは！' })
    const res = await orchestrator.handleChat({ message: 'こんにちは', userId: 'u1' })
    expect(res.agent).toBe('shopper')
    expect(res.state).toBe('completed')
    expect(res.reply).toBe('こんにちは！')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('委譲先の input-required を中継し pending を記録する', async () => {
    chooseDelegate.mockResolvedValue({ kind: 'delegate', agent: 'recommendation' })
    sendMessage.mockResolvedValue(
      taskResult(TaskState.TASK_STATE_INPUT_REQUIRED, 'どんな用途ですか？'),
    )
    const res = await orchestrator.handleChat({ message: 'マグが欲しい', userId: 'u1' })
    expect(res.agent).toBe('recommendation')
    expect(res.state).toBe('input-required')
    expect(res.reply).toBe('どんな用途ですか？')

    // 次のターンは委譲判断をスキップし、同一タスクを再開する
    sendMessage.mockResolvedValue(
      taskResult(TaskState.TASK_STATE_COMPLETED, 'おすすめは Gorilla Mug'),
    )
    const res2 = await orchestrator.handleChat({
      conversationId: res.conversationId,
      message: 'コーヒー用',
      userId: 'u1',
    })
    expect(chooseDelegate).toHaveBeenCalledTimes(1)
    expect(res2.state).toBe('completed')
    const secondCall = sendMessage.mock.calls[1][0]
    expect(secondCall.message.taskId).toBe('task-1')
    expect(secondCall.message.contextId).toBe('ctx-1')
  })

  it('委譲先が failed を返したら pending を解除しエラーメッセージを中継する', async () => {
    chooseDelegate.mockResolvedValue({ kind: 'delegate', agent: 'order' })
    sendMessage.mockResolvedValue(taskResult(TaskState.TASK_STATE_FAILED, '内部エラー'))
    const res = await orchestrator.handleChat({ message: '注文して', userId: 'u1' })
    expect(res.state).toBe('failed')
    const res2 = await orchestrator.handleChat({
      conversationId: res.conversationId,
      message: 'もう一度',
      userId: 'u1',
    })
    // pending が解除されているので改めて委譲判断が走る
    expect(chooseDelegate).toHaveBeenCalledTimes(2)
    expect(res2).toBeDefined()
  })

  it('userId が A2A メッセージ metadata で伝搬される', async () => {
    chooseDelegate.mockResolvedValue({ kind: 'delegate', agent: 'order' })
    sendMessage.mockResolvedValue(taskResult(TaskState.TASK_STATE_COMPLETED, '完了'))
    await orchestrator.handleChat({ message: '注文', userId: 'user-abc' })
    expect(sendMessage.mock.calls[0][0].message.metadata).toEqual({ userId: 'user-abc' })
  })
})
