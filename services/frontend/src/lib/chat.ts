export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * agent-service に送るメッセージ配列を組み立てる。
 *
 * サジェスト（想定質問）は履歴を付けず質問単体で送る（standalone=true）。ワンクリックで
 * その質問だけを問い合わせる用途のため、直前の会話文脈に引きずられない方が結果が安定する。
 * 手入力メッセージは履歴を含めてマルチターンの文脈を保つ（standalone=false）。
 *
 * 注: フロントの AI チャットは Agent 経由（/api/agent/chat → /ai/agent/v1）でキャッシュ非対象。
 * Kong の ai-semantic-cache は一問一答の /ai/v1（curl デモ経路）にのみ適用される。
 */
export function buildChatMessages(
  history: ChatMessage[],
  userMessage: ChatMessage,
  standalone: boolean,
): ChatMessage[] {
  return standalone ? [userMessage] : [...history, userMessage]
}
