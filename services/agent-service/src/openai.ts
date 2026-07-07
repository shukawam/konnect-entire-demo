import { z } from 'zod'

export const openaiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

// AI Proxy Advanced が転送してくる OpenAI chat completion リクエスト。
// messages 以外（model / temperature 等）は無視してよい。
export const chatCompletionRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(openaiMessageSchema).min(1),
})

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>

// messages 配列を runAgent に渡す 1 本の prompt に組み立てる。
// 通常このルートに system は乗らない（decorator は別 service）が、来ても壊れないよう扱う。
export function buildPromptFromMessages(messages: { role: string; content: string }[]): string {
  return messages
    .map((m) => {
      const label = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'
      return `${label}: ${m.content}`
    })
    .join('\n')
}

// runAgent の出力（文字列）を OpenAI chat completion 形式にラップする。
// AI Proxy Advanced がこの形式を解釈し、ai-semantic-cache がこの応答をキャッシュする。
// usage はデモでは 0 埋めで十分（正確なトークン計算は将来の拡張余地）。
export function toChatCompletion(content: string, model = 'gpt-4o-mini') {
  return {
    id: 'chatcmpl-agent',
    object: 'chat.completion' as const,
    created: 0,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant' as const, content },
        finish_reason: 'stop' as const,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}
