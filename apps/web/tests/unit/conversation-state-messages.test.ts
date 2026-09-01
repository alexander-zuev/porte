import {
  ConversationIdSchema,
  MessageIdSchema,
  createAttemptId,
  turnIdFor,
  type ConversationState,
  type ConversationTurn,
} from '@porte/core/client'
import {
  conversationStateToMessages,
  dequeuedRowMetadata,
  foldQueuedRows,
  isQueuedRow,
  nextUserRow,
  queuedRowMetadata,
  queuedRows,
  turnToMessages,
} from '@web/lib/conversation/conversation-state-messages.ts'
import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

const id = (value: string) => MessageIdSchema.parse(value)
const conversationId = ConversationIdSchema.parse('c1')
const turnId = turnIdFor(conversationId, 0)

const turn: ConversationTurn = {
  turnId,
  items: [
    {
      type: 'message',
      turnId,
      messageId: id(`${turnId}:user`),
      role: 'user',
      content: [{ type: 'text', text: 'Question' }],
    },
    {
      type: 'reasoning',
      turnId,
      messageId: id(`${turnId}:reasoning:1`),
      content: [{ type: 'text', text: 'Think' }],
    },
    {
      type: 'message',
      turnId,
      messageId: id(`${turnId}:assistant:2`),
      role: 'assistant',
      content: [{ type: 'text', text: 'Answer' }],
    },
  ],
  tools: [],
}

describe('turnToMessages', () => {
  it('names the assistant row after the turn, so it matches the live stream', async () => {
    const messages = await turnToMessages(turn, [])
    expect(messages.map((message) => `${message.role} ${message.id}`)).toEqual([
      `user ${turnId}:user`,
      `assistant ${turnId}`,
    ])
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(['step-start', 'reasoning', 'text'])
  })

  it('reuses the stored user row that carries the same turn in its metadata', async () => {
    const stored: UIMessage[] = [
      {
        id: 'browser-1',
        role: 'user',
        metadata: { turnId },
        parts: [{ type: 'text', text: 'Question' }],
      },
    ]
    const messages = await turnToMessages(turn, stored)
    expect(messages[0]?.id).toBe('browser-1')
  })
})

describe('conversationStateToMessages', () => {
  it('keeps user and assistant content in order, one assistant row per turn', async () => {
    const second = turnIdFor(conversationId, 1)
    const state: ConversationState = {
      turn: { state: 'idle' },
      items: [
        ...turn.items,
        {
          type: 'message',
          turnId: second,
          messageId: id(`${second}:user`),
          role: 'user',
          content: [{ type: 'text', text: 'Again' }],
        },
        {
          type: 'message',
          turnId: second,
          messageId: id(`${second}:assistant:1`),
          role: 'assistant',
          content: [{ type: 'text', text: 'Sure' }],
        },
      ],
      tools: [],
      plans: [],
      pending: { permissions: [], elicitations: [] },
    }

    const messages = await conversationStateToMessages(state, [])
    expect(messages.map((message) => `${message.role} ${message.id}`)).toEqual([
      `user ${turnId}:user`,
      `assistant ${turnId}`,
      `user ${second}:user`,
      `assistant ${second}`,
    ])
  })
})

const text = (value: string): UIMessage['parts'][number] => ({ type: 'text', text: value })

describe('queued rows', () => {
  const linked: UIMessage = { id: 'u1', role: 'user', metadata: { turnId }, parts: [text('A')] }
  const sent: UIMessage = {
    id: 'u2',
    role: 'user',
    metadata: { attemptId: createAttemptId() },
    parts: [text('B')],
  }
  const queued: UIMessage = {
    id: 'u3',
    role: 'user',
    metadata: queuedRowMetadata(2),
    parts: [text('C')],
  }
  const bare: UIMessage = { id: 'u4', role: 'user', parts: [text('D')] }

  it('marks only user rows that carry the queued flag', () => {
    expect(isQueuedRow(queued)).toBe(true)
    expect(isQueuedRow(bare)).toBe(false)
    expect(isQueuedRow({ ...queued, role: 'assistant' })).toBe(false)
  })

  it('starts the first user row with no turn link, no attempt stamp, and not queued', () => {
    expect(nextUserRow([linked, sent, queued, bare])?.id).toBe('u4')
    expect(nextUserRow([linked, sent, queued])).toBeUndefined()
    const dequeued: UIMessage = { ...queued, metadata: dequeuedRowMetadata(2) }
    expect(nextUserRow([linked, dequeued, bare])?.id).toBe('u3')
  })

  it('orders queued rows by their position, not by store order', () => {
    const later: UIMessage = {
      id: 'u5',
      role: 'user',
      metadata: queuedRowMetadata(1),
      parts: [text('E')],
    }
    expect(queuedRows([linked, queued, bare, later]).map((row) => row.id)).toEqual(['u5', 'u3'])
  })

  it('folds queued rows into one under the first id, text joined by a blank line', () => {
    const file: UIMessage['parts'][number] = { type: 'file', mediaType: 'image/png', url: 'data:' }
    const folded = foldQueuedRows([
      queued,
      { id: 'u5', role: 'user', metadata: queuedRowMetadata(3), parts: [file, text('E')] },
      { id: 'u6', role: 'user', metadata: queuedRowMetadata(4), parts: [text('F')] },
    ])
    expect(folded.id).toBe('u3')
    expect(folded.metadata).toEqual(dequeuedRowMetadata(2))
    expect(folded.parts).toEqual([text('C'), file, text('E\n\nF')])
  })
})
