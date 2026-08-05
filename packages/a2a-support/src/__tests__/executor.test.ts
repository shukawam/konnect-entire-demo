import { describe, it, expect, vi } from 'vitest'
import { TaskState } from '@a2a-js/sdk'
import { RequestContext, ServerCallContext, type ExecutionEventBus } from '@a2a-js/sdk/server'
import {
  MarkerAgentExecutor,
  parseMarkedReply,
  renderTranscript,
  lastLlmOutput,
  QUESTION_MARKER,
  DONE_MARKER,
} from '../executor.js'
import { userMessage, agentMessage } from '../messages.js'

function contextFor(text: string, opts: { userId: string; task?: any }) {
  const msg = userMessage(text, {
    userId: opts.userId,
    taskId: opts.task?.id,
    contextId: opts.task?.contextId,
  })
  return new RequestContext(
    { message: msg, configuration: undefined, metadata: undefined, tenant: '' },
    opts.task?.id ?? 'task-1',
    opts.task?.contextId ?? 'ctx-1',
    new ServerCallContext(),
    opts.task,
  )
}

function busSpy() {
  const events: any[] = []
  const bus = {
    publish: (e: any) => events.push(e),
    finished: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as ExecutionEventBus
  return { bus, events }
}

describe('parseMarkedReply', () => {
  it('QUESTION マーカーは input-required になる', () => {
    expect(parseMarkedReply(`${QUESTION_MARKER} どんな用途ですか？`)).toEqual({
      state: 'input-required',
      text: 'どんな用途ですか？',
    })
  })
  it('DONE マーカーは completed になる', () => {
    expect(parseMarkedReply(`${DONE_MARKER} おすすめは Gorilla Mug です`)).toEqual({
      state: 'completed',
      text: 'おすすめは Gorilla Mug です',
    })
  })
  it('マーカーなしは completed 扱い（スタックしない）', () => {
    expect(parseMarkedReply('こんにちは').state).toBe('completed')
  })
  it('マーカー前に前置き（ペルソナ）があっても検出する', () => {
    expect(parseMarkedReply(`ウホ！ **${QUESTION_MARKER}** どんな用途ですか？`)).toEqual({
      state: 'input-required',
      text: '** どんな用途ですか？',
    })
  })
  it('両方のマーカーがある場合は先に出現した方を採用する', () => {
    expect(parseMarkedReply(`ウホ！${DONE_MARKER} 完了 ${QUESTION_MARKER} 追加質問`).state).toBe(
      'completed',
    )
    expect(parseMarkedReply(`ウホ！${QUESTION_MARKER} 質問 ${DONE_MARKER} 完了`).state).toBe(
      'input-required',
    )
  })
})

describe('lastLlmOutput', () => {
  it('末尾がツール呼び出しステップでも最後の LLM 出力を拾う', () => {
    expect(
      lastLlmOutput([{ llmOutput: '提案です' }, { mcp: { tool: 'list-products' } } as never]),
    ).toBe('提案です')
  })
  it('複数の LLM 出力があれば最後のものを返す', () => {
    expect(lastLlmOutput([{ llmOutput: '途中' }, { llmOutput: '最終' }])).toBe('最終')
  })
  it('空文字はスキップし、どこにも出力が無ければ undefined', () => {
    expect(lastLlmOutput([{ llmOutput: '本文' }, { llmOutput: '  ' }])).toBe('本文')
    expect(lastLlmOutput([{}, {}])).toBeUndefined()
    expect(lastLlmOutput([])).toBeUndefined()
  })
})

describe('renderTranscript', () => {
  it('履歴と現在メッセージを user/agent ラベル付きで連結する', () => {
    const history = [
      userMessage('マグカップが欲しい', { userId: 'u1' }),
      agentMessage('t1', 'c1', 'どんな用途ですか？'),
    ]
    const current = userMessage('コーヒー用', { userId: 'u1' })
    expect(renderTranscript(history, current)).toBe(
      'user: マグカップが欲しい\nagent: どんな用途ですか？\nuser: コーヒー用',
    )
  })
})

describe('MarkerAgentExecutor', () => {
  it('初回ターン: task → input-required の順で publish する', async () => {
    const run = vi.fn().mockResolvedValue(`${QUESTION_MARKER} 何個必要ですか？`)
    const executor = new MarkerAgentExecutor(run)
    const { bus, events } = busSpy()
    await executor.execute(contextFor('マグを2つ', { userId: 'u1' }), bus)
    expect(events[0].kind).toBe('task')
    expect(events[1].kind).toBe('statusUpdate')
    expect(events[1].data.status.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED)
    expect(run).toHaveBeenCalledWith('user: マグを2つ', 'u1')
  })

  it('再開ターン: 既存 task を publish し completed で終わる', async () => {
    const run = vi.fn().mockResolvedValue(`${DONE_MARKER} 注文しました`)
    const executor = new MarkerAgentExecutor(run)
    const { bus, events } = busSpy()
    const task = {
      id: 't1',
      contextId: 'c1',
      status: {
        state: TaskState.TASK_STATE_INPUT_REQUIRED,
        message: undefined,
        timestamp: undefined,
      },
      artifacts: [],
      history: [userMessage('マグを2つ', { userId: 'u1' })],
      metadata: undefined,
    }
    await executor.execute(contextFor('はい', { userId: 'u1', task }), bus)
    expect(events[0].kind).toBe('task')
    expect(events.at(-1).data.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
  })

  it('run が例外を投げたら failed を publish し、原因をログに残す', async () => {
    const err = new Error('LLM down')
    const run = vi.fn().mockRejectedValue(err)
    const executor = new MarkerAgentExecutor(run)
    const { bus, events } = busSpy()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await executor.execute(contextFor('hello', { userId: 'u1' }), bus)
    expect(events.at(-1).data.status.state).toBe(TaskState.TASK_STATE_FAILED)
    expect(spy).toHaveBeenCalledWith('[a2a-support] agent run failed:', err)
    spy.mockRestore()
  })
})
