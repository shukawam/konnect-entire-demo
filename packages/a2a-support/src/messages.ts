import { v4 as uuidv4 } from 'uuid'
import { Role, type Message, type Part, type Task } from '@a2a-js/sdk'

// SDK v1 の Message は extensions / referenceTaskIds が必須（undefined だと
// compat/v0_3 の変換が落ちる）。生成は必ずこのヘルパを通すこと。
export function userMessage(
  text: string,
  opts: { taskId?: string; contextId?: string; userId: string },
): Message {
  return {
    messageId: uuidv4(),
    taskId: opts.taskId ?? '',
    contextId: opts.contextId ?? '',
    role: Role.ROLE_USER,
    // SDK の Part 型は metadata/filename/mediaType を必須プロパティとして持つが、
    // 実際のワイヤーフォーマットでは text part のみで十分なため最小のキャストで通す。
    parts: [{ content: { $case: 'text', value: text } } as Part],
    metadata: { userId: opts.userId },
    extensions: [],
    referenceTaskIds: [],
  }
}

export function agentMessage(taskId: string, contextId: string, text: string): Message {
  return {
    messageId: uuidv4(),
    taskId,
    contextId,
    role: Role.ROLE_AGENT,
    parts: [{ content: { $case: 'text', value: text } } as Part],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  }
}

export function textOf(msg: Message | undefined): string {
  return (msg?.parts ?? [])
    .map((p) => (p.content?.$case === 'text' ? p.content.value : ''))
    .join('')
}

export function replyTextOf(task: Task): string {
  return textOf(task.status?.message)
}
