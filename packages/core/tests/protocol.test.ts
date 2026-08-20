import { describe, expect, it } from 'vitest'

import {
  EventMessageSchema,
  RequestMessageSchema,
  RoutedResponseSchema,
  ConversationUpdateEventSchema,
} from '../src/index.ts'

const requestId = '0198b55e-49d4-7c8c-9f53-cd16db07ce5b'
const connectionId = '0198b55e-49d5-7b67-922a-2ee176ca2c4c'
const turnId = '0198b55e-49d6-7e0f-9917-b08777b451b9'

describe('published protocol schemas', () => {
  it('parses a turn request', () => {
    const result = RequestMessageSchema.safeParse({
      v: 1,
      type: 'request',
      requestId,
      method: 'turn.start',
      params: { conversationId: 'conversation-1', turnId, prompt: 'Continue' },
    })

    expect(result.success).toBe(true)
  })

  it('rejects a result for the wrong routed method', () => {
    const result = RoutedResponseSchema.safeParse({
      route: { connectionId },
      method: 'turn.start',
      message: { v: 1, type: 'result', requestId, result: {} },
    })

    expect(result.success).toBe(false)
  })

  it('requires one message id for each update chunk', () => {
    const result = ConversationUpdateEventSchema.safeParse({
      delivery: 'live',
      conversationId: 'conversation-1',
      turnId,
      eventId: 'event-1',
      update: { kind: 'agent_text', text: 'Done' },
    })

    expect(result.success).toBe(false)
  })

  it('parses a canonical conversation event', () => {
    const result = EventMessageSchema.safeParse({
      v: 1,
      type: 'event',
      event: 'conversation.event',
      data: { eventId: 'event-1', conversationId: 'conversation-1', type: 'turn.started', turnId },
    })

    expect(result.success).toBe(true)
  })

  it('continues to parse a legacy conversation update', () => {
    const result = EventMessageSchema.safeParse({
      v: 1,
      type: 'event',
      event: 'conversation.update',
      data: {
        delivery: 'live',
        conversationId: 'conversation-1',
        turnId,
        eventId: 'event-1',
        messageId: 'message-1',
        update: { kind: 'agent_text', text: 'Done' },
      },
    })

    expect(result.success).toBe(true)
  })
})
