import { describe, expect, it } from 'vitest'

import { CodingSessionControlsEventSchema } from '../src/coding-session-controls-event.ts'

const base = { eventId: 'event-1', sessionId: 'session-1' }
const select = {
  type: 'select',
  id: 'mode',
  name: 'Mode',
  currentValue: 'ask',
  options: [{ value: 'ask', name: 'Ask' }],
}

describe('CodingSessionControlsEventSchema', () => {
  it('parses the complete configuration list', () => {
    const result = CodingSessionControlsEventSchema.safeParse({
      ...base,
      type: 'session.configuration.updated',
      options: [select, { type: 'boolean', id: 'plan', name: 'Plan', currentValue: true }],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a select value outside its options', () => {
    const result = CodingSessionControlsEventSchema.safeParse({
      ...base,
      type: 'session.configuration.updated',
      options: [{ ...select, currentValue: 'invalid' }],
    })

    expect(result.success).toBe(false)
  })

  it('parses the complete command catalog', () => {
    const result = CodingSessionControlsEventSchema.safeParse({
      ...base,
      type: 'session.commands.updated',
      commands: [{ name: 'review', description: 'Review current changes', inputHint: '<path>' }],
    })

    expect(result.success).toBe(true)
  })
})
