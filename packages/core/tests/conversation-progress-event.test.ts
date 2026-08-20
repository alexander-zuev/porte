import { describe, expect, it } from 'vitest'

import { ConversationProgressEventSchema } from '../src/conversation-progress-event.ts'

const base = { eventId: 'event-1', conversationId: 'conversation-1' }
const turnId = '0198b55e-49d6-7e0f-9917-b08777b451b9'

describe('ConversationProgressEventSchema', () => {
  it('parses a complete ordered plan', () => {
    const result = ConversationProgressEventSchema.safeParse({
      ...base,
      type: 'plan.updated',
      turnId,
      entries: [{ content: 'Run tests', status: 'in_progress', priority: 'high' }],
    })

    expect(result.success).toBe(true)
  })

  it('parses conversation usage with cumulative cost', () => {
    const result = ConversationProgressEventSchema.safeParse({
      ...base,
      type: 'conversation.usage.updated',
      usage: { usedTokens: 2_000, sizeTokens: 8_000, cost: { amount: 0.12, currency: 'USD' } },
    })

    expect(result.success).toBe(true)
  })

  it('rejects usage above the context size', () => {
    const result = ConversationProgressEventSchema.safeParse({
      ...base,
      type: 'conversation.usage.updated',
      usage: { usedTokens: 9_000, sizeTokens: 8_000 },
    })

    expect(result.success).toBe(false)
  })
})
