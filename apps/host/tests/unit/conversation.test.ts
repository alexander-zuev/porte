import { ConversationViewError } from '@host/domain/conversation/conversation-view-reducer.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import {
  AttemptIdSchema,
  ConversationBusyError,
  ConversationIdSchema,
  IsoDateTimeSchema,
  MessageIdSchema,
  PermissionIdSchema,
  PermissionNotFoundError,
  ToolCallIdSchema,
  TurnNotFoundError,
  turnIdFor,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const conversationId = ConversationIdSchema.parse('conversation-1')
// The aggregate mints the turn from the prompt index; the first turn of a new conversation is 0.
const turnId = turnIdFor(conversationId, 0)
const attemptId = AttemptIdSchema.parse('0199f97b-9cf1-7f05-9e9d-df1647d7a821')
const userMessage = {
  id: MessageIdSchema.parse('browser-1'),
  content: [{ type: 'text' as const, text: 'hi' }],
}
const permission = {
  permissionId: PermissionIdSchema.parse(`${turnId}:permission:7`),
  toolCallId: ToolCallIdSchema.parse('tool-1'),
  title: 'Write file',
  options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' as const }],
}

function create(): Conversation {
  return Conversation.create({
    id: conversationId,
    cwd: '/repo/app',
    gitRoot: '/repo/',
    now: new Date('2026-08-27T12:00:00.000Z'),
  })
}

function running(): Conversation {
  const conversation = create()
  conversation.beginTurn(attemptId, userMessage)
  conversation.clearEvents()
  return conversation
}

function raised(conversation: Conversation): string[] {
  return conversation
    .collectEvents()
    .map((event) => (event.name === 'ConversationEventRaised' ? event.event.type : event.name))
}

describe('Conversation', () => {
  it('starts idle and empty in a git workspace, raising nothing', () => {
    const conversation = create()
    expect(conversation.gitRoot).toBe('/repo')
    expect(conversation.snapshot()).toMatchObject({ turn: { state: 'idle' }, items: [] })
    expect(conversation.collectEvents()).toEqual([])
  })

  it('restores agent facts and replays history without raising', () => {
    const conversation = Conversation.restore({
      id: conversationId,
      cwd: '/repo/app',
      gitRoot: '/repo/',
      title: 'Open flow',
      updatedAt: IsoDateTimeSchema.parse('2026-08-27T12:00:00.000Z'),
    })
    conversation.replay([
      { type: 'message.started', turnId, messageId: userMessage.id, role: 'user' },
      {
        type: 'message.delta',
        turnId,
        messageId: userMessage.id,
        content: userMessage.content[0]!,
      },
    ])
    expect(conversation.title).toBe('Open flow')
    expect(conversation.snapshot().items).toEqual([
      {
        type: 'message',
        turnId,
        messageId: userMessage.id,
        role: 'user',
        content: userMessage.content,
      },
    ])
    expect(conversation.collectEvents()).toEqual([])
  })

  it('beginTurn mints the turn from the prompt index and names the user message after it', () => {
    const conversation = create()
    expect(conversation.beginTurn(attemptId, userMessage)).toBe(turnId)
    const events = conversation.collectEvents()
    expect(events.map((event) => ('event' in event ? event.event.type : event.name))).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
    ])
    expect(events[0]).toMatchObject({ event: { type: 'turn.started', turnId, attemptId } })
    expect(conversation.snapshot()).toMatchObject({
      turn: { state: 'running', turnId },
      items: [
        {
          type: 'message',
          turnId,
          messageId: `${turnId}:user`,
          role: 'user',
          content: userMessage.content,
        },
      ],
    })
  })

  it('beginTurn repeats an attempt as a no-op and rejects a second attempt while running', () => {
    const conversation = running()
    expect(conversation.beginTurn(attemptId, userMessage)).toBe(turnId)
    expect(conversation.collectEvents()).toEqual([])
    expect(() => {
      conversation.beginTurn(
        AttemptIdSchema.parse('0199f97b-9cf1-7f05-9e9d-df1647d7a822'),
        userMessage,
      )
    }).toThrow(ConversationBusyError)
  })

  it('beginTurn repeats the last finished attempt without a new turn', () => {
    const conversation = running()
    conversation.finishTurn(turnId, { type: 'completed', reason: 'completed' })
    conversation.clearEvents()
    expect(conversation.beginTurn(attemptId, userMessage)).toBe(turnId)
    expect(conversation.collectEvents()).toEqual([])
    expect(conversation.turn).toEqual({ state: 'idle' })
  })

  it('the second turn takes prompt index 1', () => {
    const conversation = running()
    conversation.finishTurn(turnId, { type: 'completed', reason: 'completed' })
    const next = conversation.beginTurn(
      AttemptIdSchema.parse('0199f97b-9cf1-7f05-9e9d-df1647d7a823'),
      userMessage,
    )
    expect(next).toBe(turnIdFor(conversationId, 1))
  })

  it('requestPermission needs a running turn', () => {
    expect(() => {
      create().requestPermission(permission)
    }).toThrow(TurnNotFoundError)
  })

  it('answerPermission accepts an offered option only and clears the pending row', () => {
    const conversation = running()
    conversation.requestPermission(permission)
    expect(() => {
      conversation.answerPermission(turnId, permission.permissionId, 'deny')
    }).toThrow(PermissionNotFoundError)
    conversation.answerPermission(turnId, permission.permissionId, 'allow')
    expect(raised(conversation)).toEqual(['permission.requested', 'permission.resolved'])
    expect(conversation.snapshot().pending.permissions).toEqual([])
  })

  it('cancelTurn resolves every pending as cancelled and keeps the turn running', () => {
    const conversation = running()
    conversation.requestPermission(permission)
    conversation.cancelTurn(turnId)
    expect(conversation.collectEvents().at(-1)).toMatchObject({
      event: { type: 'permission.resolved', outcome: { type: 'cancelled' } },
    })
    expect(conversation.snapshot()).toMatchObject({
      turn: { state: 'running' },
      pending: { permissions: [] },
    })
  })

  it('finishTurn raises turn.finished once', () => {
    const conversation = running()
    conversation.finishTurn(turnId, { type: 'cancelled' })
    conversation.finishTurn(turnId, { type: 'cancelled' })
    expect(raised(conversation)).toEqual(['turn.finished'])
    expect(conversation.turn).toEqual({ state: 'idle' })
  })

  it('cancelTurn after the turn ended is a no-op, not an error', () => {
    const conversation = running()
    conversation.finishTurn(turnId, { type: 'completed', reason: 'completed' })
    conversation.clearEvents()
    conversation.cancelTurn(turnId)
    expect(conversation.collectEvents()).toEqual([])
  })

  it('turnTranscript returns one turn slice and rejects an unknown turn', () => {
    const conversation = running()
    const messageId = MessageIdSchema.parse(`${turnId}:assistant:1`)
    conversation.applyAgentEvents([
      { type: 'message.started', turnId, messageId, role: 'assistant' },
      { type: 'message.delta', turnId, messageId, content: { type: 'text', text: 'Done' } },
    ])
    const slice = conversation.turnTranscript(turnId)
    expect(slice.turnId).toBe(turnId)
    expect(slice.items.map((item) => item.type)).toEqual(['message', 'message'])
    expect(() => conversation.turnTranscript(turnIdFor(conversationId, 9))).toThrow(
      TurnNotFoundError,
    )
  })

  it('applyAgentEvents folds metadata and rejects turn events while idle', () => {
    const conversation = create()
    conversation.applyAgentEvents([
      { type: 'conversation.metadata.updated', update: { title: 'Fix bug' } },
    ])
    expect(conversation.title).toBe('Fix bug')
    expect(() => {
      conversation.applyAgentEvents([
        { type: 'message.started', turnId, messageId: userMessage.id, role: 'assistant' },
      ])
    }).toThrow(TurnNotFoundError)
  })

  it('applyAgentEvents rejects a delta for a message that never started', () => {
    const conversation = running()
    expect(() => {
      conversation.applyAgentEvents([
        {
          type: 'message.delta',
          turnId,
          messageId: MessageIdSchema.parse(`${turnId}:assistant:1`),
          content: { type: 'text', text: 'Done' },
        },
      ])
    }).toThrow(ConversationViewError)
  })
})
