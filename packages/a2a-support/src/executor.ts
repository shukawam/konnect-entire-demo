import { Role, TaskState, type Message } from '@a2a-js/sdk'
import {
  AgentEvent,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from '@a2a-js/sdk/server'
import { agentMessage, textOf } from './messages.js'

// 専門エージェントの LLM 応答プロトコル: 応答文字列の先頭マーカーでタスク状態を表す。
// [QUESTION] = ユーザーへの追加質問（input-required） / [DONE] = 完了（completed）。
export const QUESTION_MARKER = '[QUESTION]'
export const DONE_MARKER = '[DONE]'

export function parseMarkedReply(raw: string): {
  state: 'input-required' | 'completed'
  text: string
} {
  const trimmed = raw.trim()
  if (trimmed.startsWith(QUESTION_MARKER)) {
    return { state: 'input-required', text: trimmed.slice(QUESTION_MARKER.length).trim() }
  }
  if (trimmed.startsWith(DONE_MARKER)) {
    return { state: 'completed', text: trimmed.slice(DONE_MARKER.length).trim() }
  }
  // マーカーなしはタスクを止めないため completed 扱いにする
  return { state: 'completed', text: trimmed }
}

export function renderTranscript(history: Message[], current: Message): string {
  const lines = [...history, current].map((m) => {
    const role = m.role === Role.ROLE_AGENT ? 'agent' : 'user'
    return `${role}: ${textOf(m)}`
  })
  return lines.join('\n')
}

// volcano agent 呼び出し（run コールバック）を A2A タスクライフサイクルへ橋渡しする汎用
// エグゼキュータ。SDK の制約により、最初のイベントは必ず task（または message）にする。
export class MarkerAgentExecutor implements AgentExecutor {
  constructor(private readonly run: (transcript: string, userId: string) => Promise<string>) {}

  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId } = ctx
    const userId = String(ctx.userMessage.metadata?.userId ?? 'anonymous')
    if (ctx.task) {
      bus.publish(AgentEvent.task(ctx.task))
    } else {
      bus.publish(
        AgentEvent.task({
          id: taskId,
          contextId,
          status: {
            state: TaskState.TASK_STATE_SUBMITTED,
            message: undefined,
            timestamp: undefined,
          },
          artifacts: [],
          history: [ctx.userMessage],
          metadata: undefined,
        }),
      )
    }

    let state: TaskState
    let text: string
    try {
      // 再開ターンでは SDK が ctx.task.history に現在メッセージを既に含めているため、
      // renderTranscript で重ねて連結すると二重に現れる。ここで除外する。
      const history = (ctx.task?.history ?? []).filter(
        (m) => m.messageId !== ctx.userMessage.messageId,
      )
      const transcript = renderTranscript(history, ctx.userMessage)
      const parsed = parseMarkedReply(await this.run(transcript, userId))
      state =
        parsed.state === 'input-required'
          ? TaskState.TASK_STATE_INPUT_REQUIRED
          : TaskState.TASK_STATE_COMPLETED
      text = parsed.text
    } catch {
      state = TaskState.TASK_STATE_FAILED
      text = 'エージェント内部でエラーが発生しました。もう一度お試しください。'
    }

    bus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state,
          message: agentMessage(taskId, contextId, text),
          timestamp: new Date().toISOString(),
        },
        metadata: undefined,
      }),
    )
    bus.finished()
  }

  async cancelTask(): Promise<void> {
    // v1 スコープではキャンセル未対応（ブロッキング send のみ）
  }
}
