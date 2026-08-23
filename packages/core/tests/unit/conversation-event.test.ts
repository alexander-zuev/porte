import { describe, expect, it } from 'vitest'

import { ConversationEventSchema } from '../../src/conversation/conversation-event.ts'
import { ConversationStateSnapshotSchema } from '../../src/conversation/conversation-view.ts'

const snapshot = {
  turn: { state: 'idle' },
  plans: [],
  usage: null,
  configuration: null,
  commands: null,
  modeId: null,
  pending: { permissions: [], elicitations: [] },
}

describe('conversation contracts', () => {
  it('parses complete conversation state', () => {
    expect(ConversationStateSnapshotSchema.safeParse(snapshot).success).toBe(true)
  })

  it('rejects incomplete conversation state', () => {
    const { pending: _pending, ...incomplete } = snapshot

    expect(ConversationStateSnapshotSchema.safeParse(incomplete).success).toBe(false)
  })

  it('keeps a state snapshot out of the event contract', () => {
    expect(
      ConversationEventSchema.safeParse({ type: 'conversation.snapshot', snapshot }).success,
    ).toBe(false)
  })
})
