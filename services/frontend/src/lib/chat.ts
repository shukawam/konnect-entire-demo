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
 * 注: フロントの AI チャットは Kong の境界ルート /ai/agent-chat/v1 経由で、
 * ai-proxy-advanced(upstream=agent) + ai-semantic-cache により応答が Kong 層でキャッシュされる。
 */
export function buildChatMessages(
  history: ChatMessage[],
  userMessage: ChatMessage,
  standalone: boolean,
): ChatMessage[] {
  return standalone ? [userMessage] : [...history, userMessage]
}

/**
 * Kong 境界ルート（/ai/agent-chat/v1）へ送る OpenAI 互換の chat completion リクエストを組み立てる。
 * ai-semantic-cache のキャッシュキーはここで送る messages（＝ユーザー質問）に基づく。
 */
export function buildChatCompletionRequest(
  history: ChatMessage[],
  userMessage: ChatMessage,
  standalone: boolean,
): { model: string; messages: ChatMessage[] } {
  return {
    model: 'gpt-4o-mini',
    messages: buildChatMessages(history, userMessage, standalone),
  }
}
