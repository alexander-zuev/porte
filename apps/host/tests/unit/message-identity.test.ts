import {
  assistantMessageId,
  permissionId,
  userMessageId,
} from '@host/domain/conversation/message-identity.ts'
import { ConversationIdSchema, turnIdFor } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('message identity', () => {
  it('derives every id from the turn so a reload maps to the same ids', () => {
    const turnId = turnIdFor(ConversationIdSchema.parse('c1'), 0)
    expect(turnId).toBe('c1:turn:0')
    expect(userMessageId(turnId)).toBe('c1:turn:0:user')
    expect(assistantMessageId(turnId, 2)).toBe('c1:turn:0:assistant:2')
    expect(permissionId(turnId, 7)).toBe('c1:turn:0:permission:7')
  })
})
