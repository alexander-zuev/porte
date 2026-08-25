import { describe, expect, it } from 'vitest'

import { ConversationLifecycleEventSchema } from '../../src/conversation/conversation-lifecycle-event.ts'

const base = { eventId: 'event-1', conversationId: 'conversation-1' }

describe('ConversationLifecycleEventSchema', () => {
  it('parses an explicit metadata clear', () => {
    const result = ConversationLifecycleEventSchema.safeParse({
      ...base,
      type: 'conversation.metadata.updated',
      update: { title: null, updatedAt: null },
    })

    expect(result.success).toBe(true)
  })

  it('rejects an empty metadata update', () => {
    const result = ConversationLifecycleEventSchema.safeParse({
      ...base,
      type: 'conversation.metadata.updated',
      update: {},
    })

    expect(result.success).toBe(false)
  })

  it('parses a safe conversation failure', () => {
    const result = ConversationLifecycleEventSchema.safeParse({
      ...base,
      type: 'conversation.failed',
      error: { _tag: 'CodingAgentUnavailableError', message: 'Agent unavailable' },
    })

    expect(result.success).toBe(true)
  })
})
