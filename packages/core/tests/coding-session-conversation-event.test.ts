import { describe, expect, it } from 'vitest'

import { CodingSessionConversationEventSchema } from '../src/coding-session-conversation-event.ts'

const turnId = '0198b55e-49d6-7e0f-9917-b08777b451b9'
const base = { eventId: 'event-1', sessionId: 'session-1', turnId }

describe('CodingSessionConversationEventSchema', () => {
  it('parses a canonical message delta', () => {
    const result = CodingSessionConversationEventSchema.safeParse({
      ...base,
      type: 'message.delta',
      messageId: 'message-1',
      content: { type: 'text', text: 'Done' },
    })

    expect(result.success).toBe(true)
  })

  it('requires one message id for each message event', () => {
    const result = CodingSessionConversationEventSchema.safeParse({
      ...base,
      type: 'message.completed',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a provider error in a failed turn', () => {
    const result = CodingSessionConversationEventSchema.safeParse({
      ...base,
      type: 'turn.finished',
      outcome: { type: 'failed', error: { code: 'GROK_RPC_ERROR', message: 'Raw failure' } },
    })

    expect(result.success).toBe(false)
  })
})
