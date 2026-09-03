import {
  ConversationIdSchema,
  MessageIdSchema,
  ToolCallIdSchema,
  createAttemptId,
  turnIdFor,
  type ConversationItem,
  type ConversationState,
  type ToolView,
} from '@porte/core/client'
import { runningTurnReplay } from '@web/lib/conversation/conversation-state-messages.ts'
import { describe, expect, it } from 'vitest'

const id = (value: string) => MessageIdSchema.parse(value)
const conversationId = ConversationIdSchema.parse('c1')
const earlier = turnIdFor(conversationId, 0)
const turnId = turnIdFor(conversationId, 1)
const attemptId = createAttemptId()

const userItem: ConversationItem = {
  type: 'message',
  turnId,
  messageId: id(`${turnId}:user`),
  role: 'user',
  content: [{ type: 'text', text: 'Question' }],
}
const reasoningItem: ConversationItem = {
  type: 'reasoning',
  turnId,
  messageId: id(`${turnId}:reasoning:1`),
  content: [{ type: 'text', text: 'Think' }],
}
const assistantItem: ConversationItem = {
  type: 'message',
  turnId,
  messageId: id(`${turnId}:assistant:2`),
  role: 'assistant',
  content: [{ type: 'text', text: 'Partial ans' }],
}
const earlierItems: ConversationItem[] = [
  { ...userItem, turnId: earlier, messageId: id(`${earlier}:user`) },
  { ...assistantItem, turnId: earlier, messageId: id(`${earlier}:assistant:1`) },
]
const tool: ToolView = {
  toolCallId: ToolCallIdSchema.parse('call-1'),
  title: 'git stash list',
  kind: 'execute',
  status: 'in_progress',
  content: [],
  locations: [],
}

/** A snapshot taken while the machine answers turn 1; turn 0 is history. */
function running(items: ConversationItem[], tools: ToolView[] = []): ConversationState {
  return {
    turn: { state: 'running', turnId, attemptId },
    items: [...earlierItems, ...items],
    tools,
    plans: [],
    pending: { permissions: [], elicitations: [] },
  }
}

const types = (state: ConversationState) => runningTurnReplay(state)?.events.map((e) => e.type)

describe('runningTurnReplay', () => {
  it('is nothing for an idle snapshot', () => {
    expect(runningTurnReplay({ ...running([userItem]), turn: { state: 'idle' } })).toBeUndefined()
  })

  it('is nothing when the running turn has no user row yet', () => {
    expect(runningTurnReplay(running([]))).toBeUndefined()
  })

  it('names the turn the way a live turn.started would', () => {
    const replay = runningTurnReplay(running([userItem]))
    expect(replay?.turn).toMatchObject({ turnId, attemptId, userMessageId: id(`${turnId}:user`) })
  })

  it('carries the user parts, so the user row can be written before any reply', () => {
    expect(runningTurnReplay(running([userItem]))?.turn.parts).toMatchObject([
      { type: 'text', text: 'Question' },
    ])
  })

  it('starts with turn.started and stops there when the reply has not begun', () => {
    expect(types(running([userItem]))).toEqual(['turn.started'])
  })

  it('replays reasoning then text in transcript order', () => {
    expect(types(running([userItem, reasoningItem, assistantItem]))).toEqual([
      'turn.started',
      'reasoning.started',
      'reasoning.delta',
      'message.started',
      'message.delta',
    ])
  })

  it('replays text alone without a reasoning part', () => {
    expect(types(running([userItem, assistantItem]))).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
    ])
  })

  it('replays a tool call of the running turn as tool.updated', () => {
    const state = running([userItem, { type: 'tool', turnId, toolCallId: tool.toolCallId }], [tool])
    expect(types(state)).toEqual(['turn.started', 'tool.updated'])
  })

  it('never closes anything: no completed, no finished', () => {
    const events =
      runningTurnReplay(running([userItem, reasoningItem, assistantItem]))?.events ?? []
    const closing = ['message.completed', 'reasoning.completed', 'turn.finished']
    expect(events.filter((e) => closing.includes(e.type))).toEqual([])
  })

  it('leaves the earlier finished turn out', () => {
    const events = runningTurnReplay(running([userItem, assistantItem]))?.events ?? []
    expect(events.every((e) => 'turnId' in e && e.turnId === turnId)).toBe(true)
  })
})
