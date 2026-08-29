import { describe, expect, it } from 'vitest'

import { ConversationIdSchema, TurnIdSchema, turnIdFor } from '../../src/identity/identity.ts'

describe('turnIdFor', () => {
  it('derives the turn id from the conversation and the prompt index', () => {
    const turnId = turnIdFor(ConversationIdSchema.parse('c1'), 3)
    expect(turnId).toBe('c1:turn:3')
    expect(TurnIdSchema.safeParse(turnId).success).toBe(true)
  })
})
