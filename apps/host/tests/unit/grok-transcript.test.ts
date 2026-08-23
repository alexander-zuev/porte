import {
  conversationViewToStoredTurns,
  pageOfTurns,
  type StoredTurn,
} from '@host/adapters/grok/grok-transcript.ts'
import {
  ConversationViewSchema,
  TranscriptCursorSchema,
  createTurnId,
  type ConversationEvent,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('conversationViewToStoredTurns', () => {
  it('uses the provider user message ID as the turn ID', () => {
    const turns = conversationViewToStoredTurns(
      ConversationViewSchema.parse({
        items: [
          {
            type: 'message',
            messageId: 'user-1',
            role: 'user',
            content: [{ type: 'text', text: 'Hi' }],
          },
          {
            type: 'message',
            messageId: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        tools: [],
        plans: [],
        pending: { permissions: [], elicitations: [] },
      }),
    )

    expect(turns[0]?.turnId).toBe('user-1')
    expect(turns[0]?.events.map((event) => event.type)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
      'message.started',
      'message.delta',
      'message.completed',
      'turn.finished',
    ])
  })

  it('keeps the final ACP tool view in its conversation turn', () => {
    const turns = conversationViewToStoredTurns(
      ConversationViewSchema.parse({
        items: [
          { type: 'message', messageId: 'user-1', role: 'user', content: [] },
          { type: 'tool', toolCallId: 'tool-1' },
        ],
        tools: [
          {
            toolCallId: 'tool-1',
            title: 'Read file',
            name: 'read_file',
            kind: 'read',
            status: 'completed',
            content: [],
            locations: [],
            rawInput: { path: '/tmp/file' },
            rawOutput: { text: 'contents' },
          },
        ],
        plans: [],
        pending: { permissions: [], elicitations: [] },
      }),
    )

    const tool = turns[0]?.events.find((event) => event.type === 'tool.updated')
    expect(tool?.type === 'tool.updated' && tool.tool.rawOutput).toEqual({ text: 'contents' })
  })
})

function turn(size: number): StoredTurn {
  const turnId = createTurnId()
  const events = Array.from({ length: size }, (): ConversationEvent => ({
    type: 'turn.started',
    turnId,
  }))
  return { turnId, events }
}

describe('pageOfTurns', () => {
  it('returns the newest turns and points at the turns before them', () => {
    const page = pageOfTurns([turn(10), turn(10), turn(10)], null, 20)

    expect(page.isOk() && page.value.next).toBe('1')
    expect(page.isOk() && page.value.events).toHaveLength(20)
  })

  it('keeps a previous page stable when the transcript grows', () => {
    const before = [turn(10), turn(10)]
    const first = pageOfTurns(before, null, 10)
    const second = pageOfTurns([...before, turn(10)], first.isOk() ? first.value.next : null, 10)

    expect(second.isOk() && second.value.events).toEqual(before[0]?.events)
  })

  it('stops after the oldest turn', () => {
    const page = pageOfTurns([turn(10), turn(10)], TranscriptCursorSchema.parse('1'), 50)

    expect(page.isOk() && page.value.next).toBe(null)
  })

  it('refuses an invalid cursor', () => {
    const page = pageOfTurns([turn(1)], 'abc', 10)

    expect(page.isErr() && page.error._tag).toBe('GrokTranscriptCursorError')
  })
})
