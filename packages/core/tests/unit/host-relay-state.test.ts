import { describe, expect, it } from 'vitest'

import {
  ConversationIdSchema,
  createMessageId,
  createTurnId,
  reduceHostRelayActivity,
  type HostRelayState,
} from '../../src/index.ts'

const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')
const turnId = createTurnId()
const initial: HostRelayState = {
  hostStatus: 'online',
  catalogRevision: 0,
  activeConversations: [],
}

describe('host relay activity', () => {
  it('adds and removes one active conversation', () => {
    const running = reduceHostRelayActivity(initial, {
      type: 'event',
      conversationId,
      event: { type: 'turn.started', turnId },
    })
    const idle = reduceHostRelayActivity(running, {
      type: 'event',
      conversationId,
      event: { type: 'turn.finished', turnId, outcome: { type: 'cancelled' } },
    })
    expect(running.activeConversations).toEqual([
      { conversationId, turnId, hasAssistantMessage: false },
    ])
    expect(idle.activeConversations).toEqual([])
  })

  it('records assistant output without storing its identifier', () => {
    const running = reduceHostRelayActivity(initial, {
      type: 'event',
      conversationId,
      event: {
        type: 'message.started',
        turnId,
        messageId: createMessageId(),
        role: 'assistant',
      },
    })
    expect(running.activeConversations).toEqual([
      { conversationId, turnId, hasAssistantMessage: true },
    ])
  })

  it('reconciles active conversations without losing observed output', () => {
    const running: HostRelayState = {
      ...initial,
      activeConversations: [{ conversationId, turnId, hasAssistantMessage: true }],
    }
    const synced = reduceHostRelayActivity(running, {
      type: 'sync',
      activeTurns: [{ conversationId, turnId }],
    })
    expect(synced.activeConversations).toEqual(running.activeConversations)
  })

  it('ignores a terminal event for a replaced turn', () => {
    const newerTurnId = createTurnId()
    const running: HostRelayState = {
      ...initial,
      activeConversations: [{ conversationId, turnId: newerTurnId, hasAssistantMessage: false }],
    }
    const next = reduceHostRelayActivity(running, {
      type: 'event',
      conversationId,
      event: { type: 'turn.finished', turnId, outcome: { type: 'cancelled' } },
    })
    expect(next).toBe(running)
  })
})
