import { describe, expect, it } from 'vitest'

import { ConversationToolEventSchema } from '../src/conversation/conversation-tool-event.ts'

const turnId = '0198b55e-49d6-7e0f-9917-b08777b451b9'
const tool = {
  toolCallId: 'tool-1',
  title: 'Edit README',
  kind: 'edit',
  status: 'completed',
  content: [{ type: 'diff', path: 'README.md', oldText: null, newText: 'Updated' }],
  locations: [{ path: 'README.md', line: 1 }],
}

describe('ConversationToolEventSchema', () => {
  it('parses one complete tool view', () => {
    const result = ConversationToolEventSchema.safeParse({
      eventId: 'event-1',
      conversationId: 'conversation-1',
      type: 'tool.updated',
      turnId,
      tool,
    })

    expect(result.success).toBe(true)
  })

  it('rejects a provider-specific tool kind', () => {
    const result = ConversationToolEventSchema.safeParse({
      eventId: 'event-1',
      conversationId: 'conversation-1',
      type: 'tool.updated',
      turnId,
      tool: { ...tool, kind: 'grok_terminal' },
    })

    expect(result.success).toBe(false)
  })

  it('requires the complete replacement view', () => {
    const { locations: _locations, ...partialTool } = tool
    const result = ConversationToolEventSchema.safeParse({
      eventId: 'event-1',
      conversationId: 'conversation-1',
      type: 'tool.updated',
      turnId,
      tool: partialTool,
    })

    expect(result.success).toBe(false)
  })

  it('rejects line zero', () => {
    const result = ConversationToolEventSchema.safeParse({
      eventId: 'event-1',
      conversationId: 'conversation-1',
      type: 'tool.updated',
      turnId,
      tool: { ...tool, locations: [{ path: 'README.md', line: 0 }] },
    })

    expect(result.success).toBe(false)
  })
})
