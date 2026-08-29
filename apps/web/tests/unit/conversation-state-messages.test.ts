import {
  ConversationIdSchema,
  MessageIdSchema,
  turnIdFor,
  type ConversationState,
  type ConversationTurn,
} from '@porte/core/client'
import {
  conversationStateToMessages,
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
