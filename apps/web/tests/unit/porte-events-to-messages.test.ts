import {
  ConversationIdSchema,
  createEventId,
  createMessageId,
  createTurnId,
  ToolCallIdSchema,
  type ConversationEvent,
  type ToolView,
} from '@porte/core/client'
import { porteEventsToMessages } from '@web/entities/conversation/porte-events-to-messages.ts'
import { describe, expect, it } from 'vitest'

const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')
const turnId = createTurnId()

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

function message(role: 'user' | 'assistant', text: string): ConversationEvent[] {
  const messageId = createMessageId()
  return [
    { eventId: createEventId(), conversationId, type: 'message.started', turnId, messageId, role },
    {
      eventId: createEventId(),
      conversationId,
      type: 'message.delta',
      turnId,
      messageId,
      content: { type: 'text', text },
    },
    { eventId: createEventId(), conversationId, type: 'message.completed', turnId, messageId },
  ]
}

describe('porteEventsToMessages', () => {
  it('keeps the person and the agent apart', () => {
    const messages = porteEventsToMessages([
      ...message('user', 'Compare the two.'),
      ...message('assistant', 'Typist wraps writes in a unit of work.'),
    ])

    expect(messages.map((held) => held.role)).toEqual(['user', 'assistant'])
    expect(messages[0]?.parts).toEqual([{ type: 'text', text: 'Compare the two.', state: 'done' }])
  })

  it('drops a message that never said anything', () => {
    const messageId = createMessageId()

    expect(
      porteEventsToMessages([
        {
          eventId: createEventId(),
          conversationId,
          type: 'message.started',
          turnId,
          messageId,
          role: 'assistant',
        },
        { eventId: createEventId(), conversationId, type: 'message.completed', turnId, messageId },
      ]),
    ).toEqual([])
  })

  it('replaces a tool call in place rather than repeating it', () => {
    const messages = porteEventsToMessages([
      { eventId: createEventId(), conversationId, type: 'tool.updated', turnId, tool: tool() },
      {
        eventId: createEventId(),
        conversationId,
        type: 'tool.updated',
        turnId,
        tool: tool({ status: 'completed' }),
      },
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0]?.parts).toHaveLength(1)
    expect(messages[0]?.parts[0]).toMatchObject({
      type: 'dynamic-tool',
      state: 'output-available',
      toolName: 'read_file',
    })
  })

  it('puts reasoning on the agent, never on the person', () => {
    const messages = porteEventsToMessages([
      ...message('user', 'Why?'),
      {
        eventId: createEventId(),
        conversationId,
        type: 'reasoning.delta',
        turnId,
        messageId: createMessageId(),
        content: { type: 'text', text: 'Because of the constraint.' },
      },
    ])

    expect(messages.map((held) => held.role)).toEqual(['user', 'assistant'])
    expect(messages[1]?.parts[0]).toMatchObject({ type: 'reasoning' })
  })

  // A code fence split across two deltas renders as literal backticks if the
  // deltas become two parts instead of one run of text.
  it('joins the deltas of one answer into one run of text', () => {
    const messageId = createMessageId()
    const delta = (text: string): ConversationEvent => ({
      eventId: createEventId(),
      conversationId,
      type: 'message.delta',
      turnId,
      messageId,
      content: { type: 'text', text },
    })

    const messages = porteEventsToMessages([
      {
        eventId: createEventId(),
        conversationId,
        type: 'message.started',
        turnId,
        messageId,
        role: 'assistant',
      },
      delta('```ts\n'),
      delta('const a = 1\n'),
      delta('```'),
    ])

    expect(messages[0]?.parts).toEqual([
      { type: 'text', text: '```ts\nconst a = 1\n```', state: 'done' },
    ])
  })

  it('gives every message its own name', () => {
    const messages = porteEventsToMessages([
      { eventId: createEventId(), conversationId, type: 'tool.updated', turnId, tool: tool() },
      ...message('user', 'Stop.'),
      {
        eventId: createEventId(),
        conversationId,
        type: 'tool.updated',
        turnId,
        tool: tool({ toolCallId: ToolCallIdSchema.parse('call-2') }),
      },
    ])

    expect(new Set(messages.map((held) => held.id)).size).toBe(messages.length)
  })

  it('finishes a tool call whose message already closed', () => {
    const messages = porteEventsToMessages([
      { eventId: createEventId(), conversationId, type: 'tool.updated', turnId, tool: tool() },
      ...message('user', 'And now?'),
      {
        eventId: createEventId(),
        conversationId,
        type: 'tool.updated',
        turnId,
        tool: tool({ status: 'completed' }),
      },
    ])

    const parts = messages.flatMap((held) => held.parts)
    expect(parts.filter((part) => part.type === 'dynamic-tool')).toHaveLength(1)
    expect(parts[0]).toMatchObject({ type: 'dynamic-tool', state: 'output-available' })
  })

  it('ignores conversation state, which is not a message', () => {
    expect(
      porteEventsToMessages([
        {
          eventId: createEventId(),
          conversationId,
          type: 'conversation.mode.updated',
          modeId: 'plan',
        },
      ]),
    ).toEqual([])
  })
})
