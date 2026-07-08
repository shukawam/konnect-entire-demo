'use client'

import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
import { apiFetch } from '@/lib/api'
import { buildChatCompletionRequest, type ChatMessage } from '@/lib/chat'
import { useAuthUser } from '@/lib/auth'

type Message = ChatMessage

interface ChatCompletionResponse {
  choices: { message: { role: string; content: string } }[]
}

interface SuggestionsResponse {
  suggestions: string[]
}

export default function AskAIDialog() {
  const { status } = useAuthUser()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        dialogRef.current &&
        !dialogRef.current.contains(target) &&
        fabRef.current &&
        !fabRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (open && suggestions.length === 0) {
      apiFetch<SuggestionsResponse>('/api/agent/suggestions')
        .then((data) => setSuggestions(data.suggestions))
        .catch(() => {})
    }
  }, [open, suggestions.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // standalone=true（サジェスト経由）は履歴を付けず質問単体を送る（会話文脈に引きずられない）。
  // 詳細は lib/chat.ts。
  const sendMessage = async (text?: string, standalone = false) => {
    const content = text || input.trim()
    if (!content || loading) return

    const userMessage: Message = { role: 'user', content }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const data = await apiFetch<ChatCompletionResponse>('/ai/agent-chat/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(buildChatCompletionRequest(messages, userMessage, standalone)),
      })
      const content =
        data.choices?.[0]?.message?.content ??
        '申し訳ありません。適切な回答を生成できませんでした。'
      setMessages([...newMessages, { role: 'assistant', content }])
    } catch (error) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content:
            error instanceof Error
              ? error.message
              : 'エラーが発生しました。しばらくしてから再度お試しください。',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // AI チャットはログイン必須。未認証（RefreshTokenError 含む）では FAB を出さない。
  // バックエンド側も Kong の openid-connect で agent 系ルートを保護している（多層防御）。
  if (status !== 'authenticated') return null

  return (
    <>
      <button
        ref={fabRef}
        className="ask-ai-fab"
        onClick={() => setOpen(!open)}
        aria-label="AI に質問"
      >
        {open ? '✕' : '✨'}
      </button>

      {open && (
        <div ref={dialogRef} className="ask-ai-dialog">
          <div className="ask-ai-header">
            <span className="ask-ai-title">Ask Gorilla</span>
          </div>

          <div className="ask-ai-messages">
            {messages.length === 0 && (
              <div className="ask-ai-welcome">
                <p>こんにちは！ゴリラストアについて何でも聞いてください。</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`ask-ai-msg ask-ai-msg-${msg.role}`}>
                <div className="ask-ai-msg-content">
                  {msg.role === 'assistant' ? <Markdown>{msg.content}</Markdown> : msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="ask-ai-msg ask-ai-msg-assistant">
                <div className="ask-ai-msg-content ask-ai-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {suggestions.length > 0 && (
            <div className="ask-ai-suggestion-bar">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="ask-ai-suggestion-chip"
                  onClick={() => sendMessage(s, true)}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="ask-ai-input-bar">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力..."
              disabled={loading}
            />
            <button
              className="ask-ai-send"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
            >
              送信
            </button>
          </div>
        </div>
      )}
    </>
  )
}
