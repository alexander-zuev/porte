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
  createAttemptId,
  turnIdFor,
  type ConversationEvent,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const conversationId = ConversationIdSchema.parse('conversation-1')
// Grok numbers prompts from 0; the mapper mints the turn id from that number.
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

/** What the mapper emits when Grok echoes `text` as the prompt of `turnId`. */
function echo(id = turnId, text = 'hi'): ConversationEvent[] {
  const messageId = MessageIdSchema.parse(`${id}:user`)
  return [
    { type: 'turn.started', turnId: id, attemptId: createAttemptId() },
    { type: 'message.started', turnId: id, messageId, role: 'user' },
    { type: 'message.delta', turnId: id, messageId, content: { type: 'text', text } },
    { type: 'message.completed', turnId: id, messageId },
  ]
}

const finished: ConversationEvent = {
  type: 'turn.finished',
  turnId,
  outcome: { type: 'completed', reason: 'completed' },
}

function create(): Conversation {
  return Conversation.create({
    id: conversationId,
    cwd: '/repo/app',
    gitRoot: '/repo/',
    now: new Date('2026-08-27T12:00:00.000Z'),
  })
}

/** A turn this Host asked for, echoed by Grok and bound to `attemptId`. */
function running(): Conversation {
  const conversation = create()
  conversation.requestTurn(attemptId, userMessage)
  conversation.applyAgentEvents(echo())
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

  it('restores agent facts and replays history without raising, boundaries included', () => {
    const conversation = Conversation.restore({
      id: conversationId,
      cwd: '/repo/app',
      gitRoot: '/repo/',
      title: 'Open flow',
      updatedAt: IsoDateTimeSchema.parse('2026-08-27T12:00:00.000Z'),
    })
    conversation.replay([...echo(), finished, ...echo(turnIdFor(conversationId, 1), 'more')])
    expect(conversation.title).toBe('Open flow')
    expect(conversation.snapshot().items).toHaveLength(2)
    // The second turn never finished on the agent: it is still running there.
    expect(conversation.turn).toMatchObject({
      state: 'running',
      turnId: turnIdFor(conversationId, 1),
    })
    expect(conversation.collectEvents()).toEqual([])
  })

  it('binds the echo of a requested prompt to its attempt and raises the turn', () => {
    const conversation = create()
    expect(conversation.requestTurn(attemptId, userMessage)).toEqual({ type: 'sent' })
    conversation.applyAgentEvents(echo())
    const events = conversation.collectEvents()
    expect(events.map((event) => ('event' in event ? event.event.type : event.name))).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
    ])
    expect(events[0]).toMatchObject({ event: { type: 'turn.started', turnId, attemptId } })
    expect(conversation.snapshot()).toMatchObject({
      turn: { state: 'running', turnId, attemptId },
      items: [{ type: 'message', turnId, role: 'user', content: userMessage.content }],
    })
  })

  it('keeps the stream attempt id for a turn typed elsewhere, and keeps the request pending', () => {
    const conversation = create()
    conversation.requestTurn(attemptId, userMessage)
    conversation.applyAgentEvents(echo(turnId, 'typed in the terminal'))
    const started = conversation.collectEvents()[0]
    expect(started).toMatchObject({ event: { type: 'turn.started', turnId } })
    expect(started).not.toMatchObject({ event: { attemptId } })
    expect(conversation.requestTurn(attemptId, userMessage)).toEqual({ type: 'pending' })
  })

  it('a repeated attempt answers with its turn and sends nothing; a second attempt is busy', () => {
    const conversation = running()
    expect(conversation.requestTurn(attemptId, userMessage)).toEqual({ type: 'repeated', turnId })
    expect(conversation.collectEvents()).toEqual([])
    expect(() => {
      conversation.requestTurn(
        AttemptIdSchema.parse('0199f97b-9cf1-7f05-9e9d-df1647d7a822'),
        userMessage,
      )
    }).toThrow(ConversationBusyError)
  })

  it('the stream ends the turn; a second finish or late events are dropped', () => {
    const conversation = running()
    conversation.applyAgentEvents([finished])
    conversation.applyAgentEvents([finished])
    conversation.applyAgentEvents([
      { type: 'message.started', turnId, messageId: userMessage.id, role: 'assistant' },
    ])
    expect(raised(conversation)).toEqual(['turn.finished'])
    expect(conversation.turn).toEqual({ state: 'idle' })
    expect(conversation.requestTurn(attemptId, userMessage)).toEqual({ type: 'repeated', turnId })
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

  it('a tool that runs while its permission is parked was answered elsewhere', () => {
    const conversation = running()
    conversation.requestPermission(permission)
    conversation.applyAgentEvents([
      {
        type: 'tool.updated',
        turnId,
        tool: {
          toolCallId: permission.toolCallId,
          title: 'Write file',
          kind: 'edit',
          status: 'in_progress',
          content: [],
          locations: [],
        },
      },
    ])
    expect(conversation.collectEvents().at(-1)).toMatchObject({
      event: { type: 'permission.resolved', outcome: { type: 'answered-elsewhere' } },
    })
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

  it('finishTurn ends the turn here once; a later stream finish is dropped', () => {
    const conversation = running()
    conversation.finishTurn(turnId, { type: 'cancelled' })
    conversation.finishTurn(turnId, { type: 'cancelled' })
    conversation.applyAgentEvents([finished])
    expect(raised(conversation)).toEqual(['turn.finished'])
    expect(conversation.turn).toEqual({ state: 'idle' })
  })

  it('cancelTurn after the turn ended is a no-op, not an error', () => {
    const conversation = running()
    conversation.applyAgentEvents([finished])
    conversation.clearEvents()
    conversation.cancelTurn(turnId)
    expect(conversation.collectEvents()).toEqual([])
  })

  it('turnTranscript returns one turn slice with its attempt and rejects an unknown turn', () => {
    const conversation = running()
    const messageId = MessageIdSchema.parse(`${turnId}:assistant:1`)
    conversation.applyAgentEvents([
      { type: 'message.started', turnId, messageId, role: 'assistant' },
      { type: 'message.delta', turnId, messageId, content: { type: 'text', text: 'Done' } },
    ])
    const slice = conversation.turnTranscript(turnId)
    expect(slice).toMatchObject({ turnId, attemptId })
    expect(slice.items.map((item) => item.type)).toEqual(['message', 'message'])
    expect(() => conversation.turnTranscript(turnIdFor(conversationId, 9))).toThrow(
      TurnNotFoundError,
    )
  })

  it('applyAgentEvents folds metadata and drops turn events while idle', () => {
    const conversation = create()
    conversation.applyAgentEvents([
      { type: 'conversation.metadata.updated', update: { title: 'Fix bug' } },
      { type: 'message.started', turnId, messageId: userMessage.id, role: 'assistant' },
    ])
    expect(conversation.title).toBe('Fix bug')
    expect(conversation.snapshot().items).toEqual([])
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
