import {
  retryDelayMs,
  WebSocketPorteConnection,
} from '@host/adapters/websocket/websocket-porte-relay.ts'
import { ConversationEventSchema } from '@porte/core/conversation-event'
import { describe, expect, it } from 'vitest'

describe('retryDelayMs', () => {
  it('uses bounded exponential delays', () => {
    expect([0, 1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([250, 500, 1_000, 2_000, 4_000, 5_000])
  })
})

describe('WebSocketPorteConnection', () => {
  it('routes a canonical event to its conversation audience', () => {
    const sent: string[] = []
    const connection = new WebSocketPorteConnection((frame) => sent.push(frame))
    const event = ConversationEventSchema.parse({
      eventId: 'event-1',
      conversationId: 'conversation-1',
      type: 'turn.started',
      turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
    })

    connection.sendConversationEvent(event)

    expect(sent).toEqual([
      JSON.stringify({
        audience: { type: 'conversation', conversationId: 'conversation-1' },
        message: { v: 1, type: 'event', event: 'conversation.event', data: event },
      }),
    ])
  })
})
