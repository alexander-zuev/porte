import { ConversationViewError } from '@host/domain/conversation/conversation-view-reducer.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import {
  ConversationBusyError,
  ConversationIdSchema,
  IsoDateTimeSchema,
  MessageIdSchema,
  PermissionIdSchema,
  PermissionNotFoundError,
  ToolCallIdSchema,
  TurnIdSchema,
  TurnNotFoundError,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const turnId = TurnIdSchema.parse('turn-1')
const userMessage = {
  id: MessageIdSchema.parse('turn-1:user'),
  content: [{ type: 'text' as const, text: 'hi' }],
}
const permission = {
  permissionId: PermissionIdSchema.parse('turn-1:permission:7'),
  toolCallId: ToolCallIdSchema.parse('tool-1'),
  title: 'Write file',
  options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' as const }],
}

function create(): Conversation {
  return Conversation.create({
    id: ConversationIdSchema.parse('conversation-1'),
    cwd: '/repo/app',
    gitRoot: '/repo/',
    now: new Date('2026-08-27T12:00:00.000Z'),
  })
}

function running(): Conversation {
  const conversation = create()
  conversation.beginTurn(turnId, userMessage)
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
      id: ConversationIdSchema.parse('conversation-1'),
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
      { type: 'message', messageId: userMessage.id, role: 'user', content: userMessage.content },
    ])
    expect(conversation.collectEvents()).toEqual([])
  })

  it('beginTurn raises the turn and folds the user message', () => {
    const conversation = create()
    conversation.beginTurn(turnId, userMessage)
    expect(raised(conversation)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
    ])
    expect(conversation.snapshot()).toMatchObject({
      turn: { state: 'running', turnId },
      items: [{ type: 'message', role: 'user', content: userMessage.content }],
    })
  })

  it('beginTurn repeats as a no-op and rejects a second turn', () => {
    const conversation = running()
    conversation.beginTurn(turnId, userMessage)
    expect(conversation.collectEvents()).toEqual([])
    expect(() => {
      conversation.beginTurn(TurnIdSchema.parse('turn-2'), userMessage)
    }).toThrow(ConversationBusyError)
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
          messageId: MessageIdSchema.parse('turn-1:assistant:1'),
          content: { type: 'text', text: 'Done' },
        },
      ])
    }).toThrow(ConversationViewError)
  })
})
