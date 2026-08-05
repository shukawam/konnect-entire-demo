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
  // Kong の ai-prompt-decorator（ゴリ助ペルソナ）などがマーカーの前に前置きを足すことがあるため、
  // 先頭一致ではなく最初に出現したマーカーを採用する。テキストはマーカー以降を返す。
  const question = trimmed.indexOf(QUESTION_MARKER)
  const done = trimmed.indexOf(DONE_MARKER)
  if (question !== -1 && (done === -1 || question < done)) {
    return {
      state: 'input-required',
      text: trimmed.slice(question + QUESTION_MARKER.length).trim(),
    }
  }
  if (done !== -1) {
    return { state: 'completed', text: trimmed.slice(done + DONE_MARKER.length).trim() }
  }
  // マーカーなしはタスクを止めないため completed 扱いにする
  return { state: 'completed', text: trimmed }
}

// volcano SDK の run() は StepResult の配列を返し、`llmOutput` は任意プロパティ。
// ツール呼び出しで終わったステップには含まれないため、末尾要素だけを見ると
// 応答が生成されていても取りこぼす。最後に生成されたテキストを後ろから探す。
export function lastLlmOutput(steps: { llmOutput?: string }[]): string | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const out = steps[i]?.llmOutput
    if (out !== undefined && out.trim() !== '') return out
  }
  return undefined
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
    } catch (e) {
      // 原因は握りつぶさずコンテナログへ出す（verify-stack の運用手順が参照する）
      console.error('[a2a-support] agent run failed:', e)
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
