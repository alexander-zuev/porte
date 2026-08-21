import {
  createEventId,
  createMessageId,
  createTurnId,
  ToolCallIdSchema,
  type ConversationEvent,
  type ConversationId,
  type ToolView,
} from '@porte/core/client'
import { ConversationIdSchema, PermissionIdSchema } from '@porte/core/client'
import {
  createChunkStreamState,
  porteEventToChunks,
} from '@web/entities/conversation/porte-event-to-chunks.ts'
import { describe, expect, it } from 'vitest'

const conversationId: ConversationId = ConversationIdSchema.parse(
  '01a01e5d-e64c-76e2-9c93-ca69580001fd',
)
const turnId = createTurnId()

function chunks(...events: ConversationEvent[]) {
  const state = createChunkStreamState()
  return events.flatMap((event) => porteEventToChunks(event, state))
}

function tool(overrides: Partial<ToolView> = {}): ToolView {
  return {
    toolCallId: ToolCallIdSchema.parse('call-1'),
    title: 'read_file',
    kind: 'read',
    status: 'in_progress',
    content: [],
    locations: [],
    ...overrides,
  }
}

describe('porteEventToChunks', () => {
  it('opens and closes a turn', () => {
    expect(
      chunks(
        { eventId: createEventId(), conversationId, type: 'turn.started', turnId },
        {
          eventId: createEventId(),
          conversationId,
          type: 'turn.finished',
          turnId,
          outcome: { type: 'completed', reason: 'completed' },
        },
      ).map((chunk) => chunk.type),
    ).toEqual(['start', 'start-step', 'finish-step', 'finish'])
  })

  // A failed turn that finishes cleanly shows a truncated answer as a whole one.
  it('ends a failed turn as an error', () => {
    expect(
      chunks({
        eventId: createEventId(),
        conversationId,
        type: 'turn.finished',
        turnId,
        outcome: { type: 'failed', error: { code: 'INTERNAL_ERROR', message: 'Grok stopped.' } },
      }),
    ).toEqual([{ type: 'error', errorText: 'Grok stopped.' }])
  })

  it('ends a cancelled turn as a finish, because the person asked for it', () => {
    expect(
      chunks({
        eventId: createEventId(),
        conversationId,
        type: 'turn.finished',
        turnId,
        outcome: { type: 'cancelled' },
      }).map((chunk) => chunk.type),
    ).toEqual(['finish-step', 'finish'])
  })

  it('reports what a failed tool said, not what it was called', () => {
    const failure = chunks({
      eventId: createEventId(),
      conversationId,
      type: 'tool.updated',
      turnId,
      tool: tool({
        status: 'failed',
        content: [{ type: 'content', content: { type: 'text', text: 'No such file.' } }],
      }),
    }).at(-1)

    expect(failure).toMatchObject({ type: 'tool-output-error', errorText: 'No such file.' })
  })

  it('streams message text as one part', () => {
    const messageId = createMessageId()

    expect(
      chunks(
        {
          eventId: createEventId(),
          conversationId,
          type: 'message.started',
          turnId,
          messageId,
          role: 'assistant',
        },
        {
          eventId: createEventId(),
          conversationId,
          type: 'message.delta',
          turnId,
          messageId,
          content: { type: 'text', text: 'Hello' },
        },
        { eventId: createEventId(), conversationId, type: 'message.completed', turnId, messageId },
      ),
    ).toEqual([
      { type: 'text-start', id: messageId },
      { type: 'text-delta', id: messageId, delta: 'Hello' },
      { type: 'text-end', id: messageId },
    ])
  })

  it('does not replay the prompt the chat already holds', () => {
    const messageId = createMessageId()

    expect(
      chunks(
        {
          eventId: createEventId(),
          conversationId,
          type: 'message.started',
          turnId,
          messageId,
          role: 'user',
        },
        {
          eventId: createEventId(),
          conversationId,
          type: 'message.delta',
          turnId,
          messageId,
          content: { type: 'text', text: 'Compare the two.' },
        },
        { eventId: createEventId(), conversationId, type: 'message.completed', turnId, messageId },
      ),
    ).toEqual([])
  })

  // A delta whose start the stream never saw is what a reconnect always sees
  // first, and a chat treats an unopened delta as an error rather than as text.
  it('opens a run it joined late, then keeps reasoning apart from message text', () => {
    const messageId = createMessageId()

    expect(
      chunks({
        eventId: createEventId(),
        conversationId,
        type: 'reasoning.delta',
        turnId,
        messageId,
        content: { type: 'text', text: 'thinking' },
      }).map((chunk) => chunk.type),
    ).toEqual(['reasoning-start', 'reasoning-delta'])
  })

  it('announces a tool call once, however many views arrive', () => {
    const types = chunks(
      { eventId: createEventId(), conversationId, type: 'tool.updated', turnId, tool: tool() },
      { eventId: createEventId(), conversationId, type: 'tool.updated', turnId, tool: tool() },
    ).map((chunk) => chunk.type)

    expect(types).toEqual(['tool-input-available'])
  })

  it('turns a completed view into an output', () => {
    const types = chunks(
      { eventId: createEventId(), conversationId, type: 'tool.updated', turnId, tool: tool() },
      {
        eventId: createEventId(),
        conversationId,
        type: 'tool.updated',
        turnId,
        tool: tool({ status: 'completed' }),
      },
    ).map((chunk) => chunk.type)

    expect(types).toEqual(['tool-input-available', 'tool-output-available'])
  })

  it('reports a failed tool as an output error', () => {
    const types = chunks({
      eventId: createEventId(),
      conversationId,
      type: 'tool.updated',
      turnId,
      tool: tool({ status: 'failed' }),
    }).map((chunk) => chunk.type)

    expect(types).toEqual(['tool-input-available', 'tool-output-error'])
  })

  // A permission is answered beside the chat: it names its options, and it can
  // arrive before the tool call it guards, which a chat's approval flow rejects.
  it('leaves a permission request to the screen that answers it', () => {
    const permissionId = PermissionIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca6958000fff')

    expect(
      chunks({
        eventId: createEventId(),
        conversationId,
        type: 'permission.requested',
        turnId,
        permissionId,
        toolCallId: ToolCallIdSchema.parse('call-1'),
        title: 'Run tests',
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
      }),
    ).toEqual([])
  })

  it('ignores conversation state, which is not a message', () => {
    expect(
      chunks({
        eventId: createEventId(),
        conversationId,
        type: 'conversation.mode.updated',
        modeId: 'plan',
      }),
    ).toEqual([])
  })
})
