'use client'

import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
import { apiFetch } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  response: string
}

interface SuggestionsResponse {
  suggestions: string[]
}

export default function AskAIDialog() {
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

  const sendMessage = async (text?: string) => {
    const content = text || input.trim()
    if (!content || loading) return

    const userMessage: Message = { role: 'user', content }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const data = await apiFetch<ChatResponse>('/api/agent/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: newMessages }),
      })
      setMessages([...newMessages, { role: 'assistant', content: data.response }])
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
                {suggestions.length > 0 && (
                  <div className="ask-ai-suggestions">
                    {suggestions.map((s) => (
                      <button key={s} className="ask-ai-suggestion" onClick={() => sendMessage(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
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
