'use client'

import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
import { apiFetch } from '@/lib/api'
import { buildChatCompletionRequest, type ChatMessage } from '@/lib/chat'
import { useAuthUser } from '@/lib/auth'
import {
  agentBadgeLabel,
  waitingText,
  type AgentChatResponse,
  type AgentSummary,
} from '@/lib/agent-chat'

type Message = ChatMessage & { agent?: string }

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
  const [agentMode, setAgentMode] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [pendingAgent, setPendingAgent] = useState<string | undefined>(undefined)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // トリガーは Nav ヘッダー（[data-ask-ai-trigger]）にあり、'ask-ai-toggle' イベントで開閉する。
  useEffect(() => {
    const handleToggle = () => setOpen((o) => !o)
    window.addEventListener('ask-ai-toggle', handleToggle)
    return () => window.removeEventListener('ask-ai-toggle', handleToggle)
  }, [])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      // ヘッダーのトリガー押下はトグル側に委ねる（ここで閉じると二重処理になる）。
      if (target instanceof Element && target.closest('[data-ask-ai-trigger]')) return
      if (dialogRef.current && !dialogRef.current.contains(target)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  useEffect(() => {
    if (open && suggestions.length === 0) {
      apiFetch<SuggestionsResponse>('/api/agent/suggestions')
        .then((data) => setSuggestions(data.suggestions))
        .catch(() => {})
    }
  }, [open, suggestions.length])

  // Agent モードを初めて ON にしたときに発見済みエージェント一覧を取得する。
  useEffect(() => {
    if (open && agentMode && agents.length === 0) {
      apiFetch<{ agents: AgentSummary[] }>('/api/agent/agents')
        .then((data) => setAgents(data.agents))
        .catch(() => {})
    }
  }, [open, agentMode, agents.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Agent モード（A2A オーケストレーション）。conversationId で会話を継続し、
  // 応答の agent / state をメッセージ・待機表示に反映する。
  // エラーは apiFetch のマッピング（text/plain ボディ・500 含む）に委ねる。既存の catch と同じ扱い。
  const sendAgentMessage = async (content: string, history: Message[]) => {
    const data = await apiFetch<AgentChatResponse>('/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId, message: content }),
    })
    setConversationId(data.conversationId)
    setPendingAgent(data.state === 'input-required' ? data.agent : undefined)
    setMessages([...history, { role: 'assistant', content: data.reply, agent: data.agent }])
  }

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
      if (agentMode) {
        await sendAgentMessage(content, newMessages)
      } else {
        const data = await apiFetch<ChatCompletionResponse>('/ai/agent-chat/v1/chat/completions', {
          method: 'POST',
          body: JSON.stringify(buildChatCompletionRequest(messages, userMessage, standalone)),
        })
        const content =
          data.choices?.[0]?.message?.content ??
          '申し訳ありません。適切な回答を生成できませんでした。'
        setMessages([...newMessages, { role: 'assistant', content }])
      }
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

  // AI チャットはログイン必須。未認証（RefreshTokenError 含む）ではダイアログを出さない。
  // トリガー（Nav の Ask AI ボタン）も認証時のみ表示され、バックエンドも Kong の
  // openid-connect で agent 系ルートを保護している（多層防御）。
  if (status !== 'authenticated') return null

  return (
    <>
      {open && (
        <div ref={dialogRef} className="ask-ai-dialog">
          <div className="ask-ai-header">
            <span className="ask-ai-title">Ask Gorilla</span>
            <button
              type="button"
              className={`ask-ai-mode-toggle${agentMode ? ' active' : ''}`}
              onClick={() => {
                setAgentMode((m) => !m)
                setMessages([])
                setConversationId(undefined)
                setPendingAgent(undefined)
              }}
              aria-pressed={agentMode}
            >
              🤖 Agent モード
            </button>
            <button
              type="button"
              className="ask-ai-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>

          <div className="ask-ai-messages">
            {messages.length === 0 && (
              <div className="ask-ai-welcome">
                <p>
                  {agentMode
                    ? 'Agent モードです。欲しい物を伝えると、専門エージェントと連携して注文まで進めます。'
                    : 'こんにちは！ゴリラストアについて何でも聞いてください。'}
                </p>
              </div>
            )}

            {agentMode && agents.length > 0 && (
              <div className="ask-ai-agents">
                {agents.map((a) => (
                  <span key={a.key} className="ask-ai-agent-chip" title={a.description}>
                    {a.name}
                  </span>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`ask-ai-msg ask-ai-msg-${msg.role}`}>
                {msg.role === 'assistant' && msg.agent && (
                  <span className={`ask-ai-agent-badge ask-ai-agent-badge-${msg.agent}`}>
                    {agentBadgeLabel(msg.agent)}
                  </span>
                )}
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

          {agentMode && pendingAgent && !loading && (
            <div className="ask-ai-pending">{waitingText(pendingAgent)}</div>
          )}

          {!agentMode && suggestions.length > 0 && (
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
