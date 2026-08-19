import { describe, expect, it } from 'vitest'

import {
  EventMessageSchema,
  RequestMessageSchema,
  RoutedResponseSchema,
  SessionUpdateEventSchema,
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
      params: { sessionId: 'session-1', turnId, prompt: 'Continue' },
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
    const result = SessionUpdateEventSchema.safeParse({
      delivery: 'live',
      sessionId: 'session-1',
      turnId,
      eventId: 'event-1',
      update: { kind: 'agent_text', text: 'Done' },
    })

    expect(result.success).toBe(false)
  })

  it('parses a canonical session event', () => {
    const result = EventMessageSchema.safeParse({
      v: 1,
      type: 'event',
      event: 'session.event',
      data: { eventId: 'event-1', sessionId: 'session-1', type: 'turn.started', turnId },
    })

    expect(result.success).toBe(true)
  })

  it('continues to parse a legacy session update', () => {
    const result = EventMessageSchema.safeParse({
      v: 1,
      type: 'event',
      event: 'session.update',
      data: {
        delivery: 'live',
        sessionId: 'session-1',
        turnId,
        eventId: 'event-1',
        messageId: 'message-1',
        update: { kind: 'agent_text', text: 'Done' },
      },
    })

    expect(result.success).toBe(true)
  })
})
