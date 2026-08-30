import { omitUnpersistableTurn } from '@host/application/handlers/get-conversation.ts'
import {
  ToolCallIdSchema,
  turnIdFor,
  ConversationIdSchema,
  type ToolView,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const turnId = turnIdFor(ConversationIdSchema.parse('conversation-1'), 0)

const edit: ToolView = {
  toolCallId: ToolCallIdSchema.parse('tool-1'),
  title: 'Edit `README.md`',
  kind: 'edit',
  status: 'completed',
  content: [
    { type: 'diff', path: 'README.md', oldText: 'a', newText: 'b' },
    { type: 'content', content: { type: 'text', text: 'done' } },
    { type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'AAAA' } },
  ],
  locations: [{ path: 'README.md' }],
  rawInput: { old_string: 'a', new_string: 'b' },
  rawOutput: { ok: true },
}

describe('omitUnpersistableTurn', () => {
  const [tool] = omitUnpersistableTurn({
    turnId,
    items: [{ type: 'tool', turnId, toolCallId: edit.toolCallId }],
    tools: [edit],
  }).tools

  it('keeps the diff and the text body', () => {
    expect(tool?.content).toEqual([edit.content[0], edit.content[1]])
  })

  it('drops media bytes and raw tool I/O', () => {
    expect(tool?.rawInput).toBeUndefined()
    expect(tool?.rawOutput).toBeUndefined()
  })
})
