import {
  MessageIdSchema,
  ToolCallIdSchema,
  TurnIdSchema,
  type CanonicalContent,
  type ConversationEvent,
} from '@porte/core/client'
import { porteEventsToMessages } from '@web/entities/conversation/porte-events-to-messages.ts'
import { describe, expect, it } from 'vitest'

const turnId = TurnIdSchema.parse('client-request-1')
const userId = MessageIdSchema.parse('user-message-1')
const assistantId = MessageIdSchema.parse('assistant-part-1')

function exchange(content: CanonicalContent = { type: 'text', text: 'Answer' }) {
  return [
    { type: 'turn.started', turnId },
    { type: 'message.started', turnId, messageId: userId, role: 'user' },
    { type: 'message.delta', turnId, messageId: userId, content: { type: 'text', text: 'Ask' } },
    { type: 'message.completed', turnId, messageId: userId },
    { type: 'message.started', turnId, messageId: assistantId, role: 'assistant' },
    { type: 'message.delta', turnId, messageId: assistantId, content },
    { type: 'message.completed', turnId, messageId: assistantId },
    { type: 'turn.finished', turnId, outcome: { type: 'completed', reason: 'completed' } },
  ] satisfies ConversationEvent[]
}

describe('porteEventsToMessages', () => {
  it('uses the client message and turn identifiers', async () => {
    const messages = await porteEventsToMessages(exchange())

    expect(messages.map((message) => message.id)).toEqual([userId, turnId])
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  it('joins text with the AI SDK stream processor', async () => {
    const messages = await porteEventsToMessages(exchange())

    expect(messages[0]?.parts).toContainEqual({ type: 'text', text: 'Ask', state: 'done' })
    expect(messages[1]?.parts).toContainEqual({ type: 'text', text: 'Answer', state: 'done' })
  })

  it('preserves image content as a file part', async () => {
    const messages = await porteEventsToMessages(
      exchange({ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }),
    )

    expect(messages[1]?.parts).toContainEqual({
      type: 'file',
      mediaType: 'image/png',
      url: 'data:image/png;base64,aGVsbG8=',
    })
  })

  it('keeps one tool part and applies its final state', async () => {
    const toolCallId = ToolCallIdSchema.parse('tool-1')
    const events = [
      { type: 'turn.started', turnId },
      { type: 'tool.updated', turnId, tool: tool(toolCallId, 'in_progress') },
      { type: 'tool.updated', turnId, tool: tool(toolCallId, 'completed') },
    ] satisfies ConversationEvent[]
    const messages = await porteEventsToMessages(events)

    expect(messages[0]?.parts.find((part) => part.type === 'dynamic-tool')).toMatchObject({
      type: 'dynamic-tool',
      state: 'output-available',
    })
  })

  it('does not create transcript messages from state events', async () => {
    const messages = await porteEventsToMessages([
      { type: 'conversation.mode.updated', modeId: 'code' },
    ])

    expect(messages).toEqual([])
  })
})

function tool(
  toolCallId: ReturnType<typeof ToolCallIdSchema.parse>,
  status: 'in_progress' | 'completed',
) {
  return {
    toolCallId,
    title: 'Read file',
    kind: 'read' as const,
    status,
    content:
      status === 'completed'
        ? [{ type: 'content' as const, content: { type: 'text' as const, text: 'Done' } }]
        : [],
    locations: [],
  }
}
