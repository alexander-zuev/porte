import { describe, expect, it } from 'vitest'

import {
  ConversationIdSchema,
  HostCommandSchema,
  HostConversationEventSchema,
  HostConversationListMessageSchema,
  HostEventAckSchema,
  HostLedgerSchema,
  TranscriptCursorSchema,
  createHostCommand,
  createMessageId,
  createOperationId,
  createPermissionId,
  createTurnId,
  turnCancelOperationId,
} from '../../src/index.ts'

const operationId = createOperationId()
const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')
const turnId = createTurnId()
const permissionId = createPermissionId()

describe('host protocol v2', () => {
  it('accepts only numeric transcript cursors', () => {
    expect(TranscriptCursorSchema.safeParse('12').success).toBe(true)
    expect(TranscriptCursorSchema.safeParse('page-12').success).toBe(false)
  })

  it('adds relay-owned fields to a catalog command', () => {
    const command = createHostCommand({ operationId, method: 'conversations.sync' })

    expect(command).toEqual({
      v: 2,
      type: 'command',
      operationId,
      method: 'conversations.sync',
      params: {},
    })
  })

  it('reports active turns only on the final catalog chunk', () => {
    expect(
      HostConversationListMessageSchema.safeParse({
        v: 2,
        type: 'conversations.sync',
        operationId,
        conversations: [],
        done: true,
        activeTurns: [{ conversationId, turnId }],
      }).success,
    ).toBe(true)
    expect(
      HostConversationListMessageSchema.safeParse({
        v: 2,
        type: 'conversations.sync',
        operationId,
        conversations: [],
        done: true,
      }).success,
    ).toBe(false)
  })

  it('parses one typed turn command', () => {
    const parsed = HostCommandSchema.safeParse({
      v: 2,
      type: 'command',
      operationId,
      method: 'turn.start',
      params: {
        conversationId,
        turnId,
        userMessage: { id: createMessageId(), content: [{ type: 'text', text: 'Continue' }] },
      },
    })

    expect(parsed.success).toBe(true)
  })

  it('parses event delivery and acknowledgment frames', () => {
    const event = {
      type: 'turn.started',
      turnId,
    }

    expect(
      HostConversationEventSchema.safeParse({
        v: 2,
        type: 'conversation.event',
        conversationId,
        eventSequence: 1,
        event,
      }).success,
    ).toBe(true)
    expect(
      HostEventAckSchema.safeParse({
        v: 2,
        type: 'event.ack',
        conversationId,
        throughEventSequence: 1,
      }).success,
    ).toBe(true)
  })

  it('rejects a stored result for a different method', () => {
    const command = {
      v: 2,
      type: 'command',
      operationId,
      method: 'turn.start',
      params: {
        conversationId,
        turnId,
        userMessage: { id: createMessageId(), content: [{ type: 'text', text: 'Continue' }] },
      },
    }
    const response = {
      v: 2,
      type: 'command.result',
      operationId,
      result: { permissionId: 'permission-1' },
    }

    expect(
      HostLedgerSchema.safeParse({
        scopeId: 'a'.repeat(64),
        operations: {
          [operationId]: { status: 'completed', command, response, createdAt: 1, completedAt: 2 },
        },
        nextEventSequence: {},
        events: [],
      }).success,
    ).toBe(false)
  })

  it('derives one stable cancel operation per turn', () => {
    const otherTurnId = createTurnId()
    expect(turnCancelOperationId(conversationId, turnId)).toBe(
      turnCancelOperationId(conversationId, turnId),
    )
    expect(turnCancelOperationId(conversationId, turnId)).not.toBe(
      turnCancelOperationId(conversationId, otherTurnId),
    )
  })
})
