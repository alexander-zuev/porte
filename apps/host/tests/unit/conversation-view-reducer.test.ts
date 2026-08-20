import { ConversationEventSchema, ConversationViewSchema } from '@porte/core/conversation-event'
import { describe, expect, it } from 'vitest'

import { applyConversationEvents } from '../../src/application/conversation-view-reducer.ts'

const view = ConversationViewSchema.parse({
  items: [],
  tools: [],
  plan: [],
  pending: { permissions: [], elicitations: [] },
})
const envelope = { eventId: 'event-1', conversationId: 'conversation-1' }

describe('applyConversationEvents', () => {
  it('applies message deltas in order', () => {
    const events = [
      ConversationEventSchema.parse({
        ...envelope,
        type: 'message.started',
        turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
        messageId: 'message-1',
        role: 'assistant',
      }),
      ConversationEventSchema.parse({
        ...envelope,
        type: 'message.delta',
        turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
        messageId: 'message-1',
        content: { type: 'text', text: 'Done' },
      }),
    ]

    const result = applyConversationEvents(view, events)
    expect(result.isOk() && result.value.items[0]).toMatchObject({
      type: 'message',
      content: [{ type: 'text', text: 'Done' }],
    })
  })

  it('rejects a delta without a started message', () => {
    const event = ConversationEventSchema.parse({
      ...envelope,
      type: 'message.delta',
      turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
      messageId: 'message-1',
      content: { type: 'text', text: 'Done' },
    })

    expect(applyConversationEvents(view, [event]).isErr()).toBe(true)
  })
})
