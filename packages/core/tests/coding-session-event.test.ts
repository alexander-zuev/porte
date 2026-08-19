import { describe, expect, it } from 'vitest'

import { CodingSessionEventSchema } from '../src/coding-session-event.ts'

const snapshot = {
  eventId: 'event-1',
  sessionId: 'session-1',
  type: 'session.snapshot',
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

describe('CodingSessionEventSchema', () => {
  it('parses a complete session snapshot', () => {
    expect(CodingSessionEventSchema.safeParse(snapshot).success).toBe(true)
  })

  it('rejects an incomplete session snapshot', () => {
    const { pending: _pending, ...incompleteView } = snapshot.view
    const result = CodingSessionEventSchema.safeParse({ ...snapshot, view: incompleteView })

    expect(result.success).toBe(false)
  })

  it('rejects the previous session update shape', () => {
    const result = CodingSessionEventSchema.safeParse({
      eventId: 'event-1',
      sessionId: 'session-1',
      type: 'session.update',
      update: { kind: 'agent_text', text: 'Done' },
    })

    expect(result.success).toBe(false)
  })
})
