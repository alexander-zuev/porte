import { ConversationIdSchema, TurnIdSchema } from '@porte/core/client'
import {
  addUnseenConversations,
  completedAssistantConversations,
  conversationAttentionStatus,
  conversationTurnStatus,
  indexActiveConversations,
  markConversationSeen,
} from '@web/entities/conversation/conversation-attention.ts'
import { describe, expect, it } from 'vitest'

const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')
const turnId = TurnIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca6958000200')
const active = (hasAssistantMessage: boolean) =>
  indexActiveConversations([{ conversationId, turnId, hasAssistantMessage }])

describe('conversation attention', () => {
  it('finds only completed turns with assistant output', () => {
    expect(completedAssistantConversations(active(true), new Map())).toEqual([conversationId])
    expect(completedAssistantConversations(active(false), new Map())).toEqual([])
  })

  it('does not mark the visible conversation unseen', () => {
    expect(
      addUnseenConversations(
        new Set(),
        [conversationId],
        new Set([conversationId]),
        conversationId,
      ),
    ).toEqual(new Set())
  })

  it('does not mark a conversation this browser has not opened', () => {
    expect(addUnseenConversations(new Set(), [conversationId], new Set(), null)).toEqual(new Set())
  })

  it('clears unseen state when the conversation opens', () => {
    expect(markConversationSeen(new Set([conversationId]), conversationId)).toEqual(new Set())
  })

  it('derives turn and attention status independently', () => {
    expect(conversationTurnStatus(conversationId, new Set([conversationId]))).toBe('running')
    expect(conversationAttentionStatus(conversationId, new Set([conversationId]))).toBe('unseen')
  })
})
