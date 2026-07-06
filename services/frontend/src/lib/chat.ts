export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * agent-service に送るメッセージ配列を組み立てる。
 *
 * agent-service は受け取った messages を 1 つのプロンプト文字列に連結して LLM に渡すため、
 * 履歴を含めると同じ質問でもプロンプトが変化し Kong の ai-semantic-cache がヒットしない。
 * サジェスト（想定質問）は履歴を付けず質問単体で送り（standalone=true）、
 * 連続クリックでもプロンプトが完全一致して Miss→Hit を再現できるようにする。
 * 手入力メッセージは従来どおり履歴を含めてマルチターンの文脈を保つ（standalone=false）。
 */
export function buildChatMessages(
  history: ChatMessage[],
  userMessage: ChatMessage,
  standalone: boolean,
): ChatMessage[] {
  return standalone ? [userMessage] : [...history, userMessage]
}
