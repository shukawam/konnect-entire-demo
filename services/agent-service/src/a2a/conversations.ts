import { randomUUID } from 'node:crypto'

export type AgentKey = 'recommendation' | 'order'
export type Speaker = 'user' | 'shopper' | AgentKey

export interface Pending {
  agentKey: AgentKey
  taskId: string
  contextId: string
}

export interface Conversation {
  id: string
  userId: string
  pending?: Pending
  transcript: { speaker: Speaker; text: string }[]
}

// デモ規模の in-memory 会話ストア。プロセス再起動で消えるが、未知 ID は
// 新規会話として受け付けるため復帰は自然に行える（スペックのエラー処理方針）。
export class ConversationStore {
  private conversations = new Map<string, Conversation>()

  getOrCreate(id: string | undefined, userId: string): Conversation {
    if (id) {
      const existing = this.conversations.get(id)
      if (existing) {
        if (existing.userId === userId) return existing
        // 他ユーザーの会話 ID を指定された場合は既存を保持したまま別 ID で新規作成する
        return this.create(randomUUID(), userId)
      }
      // 未知の ID（プロセス再起動後など）は同じ ID で新規会話として受け付ける
      return this.create(id, userId)
    }
    return this.create(randomUUID(), userId)
  }

  private create(id: string, userId: string): Conversation {
    const conv: Conversation = { id, userId, transcript: [] }
    this.conversations.set(id, conv)
    return conv
  }

  setPending(conv: Conversation, pending: Pending): void {
    conv.pending = pending
  }

  clearPending(conv: Conversation): void {
    conv.pending = undefined
  }

  append(conv: Conversation, speaker: Speaker, text: string): void {
    conv.transcript.push({ speaker, text })
  }
}
