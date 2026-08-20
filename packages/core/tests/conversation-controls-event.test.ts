import { describe, expect, it } from 'vitest'

import { ConversationControlsEventSchema } from '../src/conversation-controls-event.ts'

const base = { eventId: 'event-1', conversationId: 'conversation-1' }
const select = {
  type: 'select',
  id: 'mode',
  name: 'Mode',
  currentValue: 'ask',
  options: [{ value: 'ask', name: 'Ask' }],
}

describe('ConversationControlsEventSchema', () => {
  it('parses the complete configuration list', () => {
    const result = ConversationControlsEventSchema.safeParse({
      ...base,
      type: 'conversation.configuration.updated',
      options: [select, { type: 'boolean', id: 'plan', name: 'Plan', currentValue: true }],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a select value outside its options', () => {
    const result = ConversationControlsEventSchema.safeParse({
      ...base,
      type: 'conversation.configuration.updated',
      options: [{ ...select, currentValue: 'invalid' }],
    })

    expect(result.success).toBe(false)
  })

  it('parses the complete command catalog', () => {
    const result = ConversationControlsEventSchema.safeParse({
      ...base,
      type: 'conversation.commands.updated',
      commands: [{ name: 'review', description: 'Review current changes', inputHint: '<path>' }],
    })

    expect(result.success).toBe(true)
  })
})
