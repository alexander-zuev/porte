import { mergeConversationHistory } from '@web/entities/conversation/merge-conversation-history.ts'
import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

describe('mergeConversationHistory', () => {
  it('replaces a partial duplicate with the completed stored message', () => {
    const partial = message('turn-1', 'Par', 'streaming')
    const completed = message('turn-1', 'Paris', 'done')

    expect(mergeConversationHistory([partial], [completed])).toEqual([completed])
  })

  it('keeps a richer live duplicate and prepends older history', () => {
    const older = message('turn-0', 'Before', 'done')
    const live = message('turn-1', 'Paris', 'streaming')
    const stored = message('turn-1', 'Par', 'done')

    expect(mergeConversationHistory([live], [older, stored])).toEqual([older, live])
  })

  it('keeps complementary parts from stored and live copies', () => {
    const stored: UIMessage = {
      id: 'turn-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Done', state: 'done' }],
    }
    const live: UIMessage = {
      id: 'turn-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Done', state: 'done' },
        { type: 'source-url', sourceId: 'source-1', url: 'https://example.com' },
      ],
    }

    expect(mergeConversationHistory([live], [stored])[0]?.parts).toEqual(live.parts)
  })
})

function message(id: string, text: string, state: 'streaming' | 'done'): UIMessage {
  return { id, role: 'assistant', parts: [{ type: 'text', text, state }] }
}
