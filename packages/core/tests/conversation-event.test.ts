import { describe, expect, it } from 'vitest'

import { ConversationEventSchema } from '../src/conversation-event.ts'

const snapshot = {
  eventId: 'event-1',
  conversationId: 'conversation-1',
  type: 'conversation.snapshot',
  view: {
    items: [
      {
        type: 'message',
        messageId: 'message-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done' }],
      },
    ],
    tools: [],
    plan: [],
    pending: { permissions: [], elicitations: [] },
  },
}

describe('ConversationEventSchema', () => {
  it('parses a complete conversation snapshot', () => {
    expect(ConversationEventSchema.safeParse(snapshot).success).toBe(true)
  })

  it('rejects an incomplete conversation snapshot', () => {
    const { pending: _pending, ...incompleteView } = snapshot.view
    const result = ConversationEventSchema.safeParse({ ...snapshot, view: incompleteView })

    expect(result.success).toBe(false)
  })

  it('rejects the previous conversation update shape', () => {
    const result = ConversationEventSchema.safeParse({
      eventId: 'event-1',
      conversationId: 'conversation-1',
      type: 'conversation.update',
      update: { kind: 'agent_text', text: 'Done' },
    })

    expect(result.success).toBe(false)
  })
})
