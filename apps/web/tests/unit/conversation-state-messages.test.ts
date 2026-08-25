import { MessageIdSchema, type ConversationState } from '@porte/core/client'
import { conversationStateToMessages } from '@web/lib/conversation/conversation-state-messages.ts'
import { describe, expect, it } from 'vitest'

const id = (value: string) => MessageIdSchema.parse(value)

describe('conversationStateToMessages', () => {
  it('keeps user and assistant content in order', async () => {
    const state: ConversationState = {
      turn: { state: 'idle' },
      items: [
        {
          type: 'message',
          messageId: id('user-1'),
          role: 'user',
          content: [{ type: 'text', text: 'Question' }],
        },
        {
          type: 'reasoning',
          messageId: id('reasoning-1'),
          content: [{ type: 'text', text: 'Think' }],
        },
        {
          type: 'message',
          messageId: id('assistant-1'),
          role: 'assistant',
          content: [{ type: 'text', text: 'Answer' }],
        },
      ],
      tools: [],
      plans: [],
      pending: { permissions: [], elicitations: [] },
    }

    const messages = await conversationStateToMessages(state)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(['step-start', 'reasoning', 'text'])
  })
})
