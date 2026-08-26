import { omitUnpersistableContent } from '@host/application/queries/get-conversation.query.ts'
import { ConversationStateSchema } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('omitUnpersistableContent', () => {
  it('drops tool bodies and media bytes', () => {
    const state = ConversationStateSchema.parse({
      turn: { state: 'idle' },
      items: [
        {
          type: 'message',
          messageId: 'user-1',
          role: 'user',
          content: [
            { type: 'text', text: 'see this' },
            { type: 'image', data: 'AAAA', mimeType: 'image/png' },
            { type: 'resource-link', uri: 'file:///tmp/a.ts', name: 'a.ts' },
          ],
        },
        { type: 'tool', toolCallId: 'tool-1' },
      ],
      tools: [
        {
          toolCallId: 'tool-1',
          title: 'Read a.ts',
          kind: 'read',
          status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: 'file body' } }],
          locations: [{ path: '/tmp/a.ts' }],
          rawInput: { path: '/tmp/a.ts' },
          rawOutput: { text: 'file body' },
        },
      ],
      plans: [],
      pending: { permissions: [], elicitations: [] },
    })

    const snapshot = omitUnpersistableContent(state)
    expect(snapshot.items[0]).toEqual({
      type: 'message',
      messageId: 'user-1',
      role: 'user',
      content: [
        { type: 'text', text: 'see this' },
        { type: 'resource-link', uri: 'file:///tmp/a.ts', name: 'a.ts' },
      ],
    })
    expect(snapshot.tools[0]).toEqual({
      toolCallId: 'tool-1',
      title: 'Read a.ts',
      kind: 'read',
      status: 'completed',
      content: [],
      locations: [{ path: '/tmp/a.ts' }],
    })
  })
})
