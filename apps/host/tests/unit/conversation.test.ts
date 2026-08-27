import { Conversation } from '@host/domain/conversation/conversation.ts'
import { ConversationIdSchema, IsoDateTimeSchema } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('Conversation', () => {
  it('starts empty in a git workspace', () => {
    const conversation = Conversation.create({
      id: ConversationIdSchema.parse('conversation-1'),
      cwd: '/repo/app',
      gitRoot: '/repo/',
      now: new Date('2026-08-27T12:00:00.000Z'),
    })
    expect(conversation.id).toBe('conversation-1')
    expect(conversation.cwd).toBe('/repo/app')
    expect(conversation.gitRoot).toBe('/repo')
    expect(conversation.title).toBe('')
    expect(conversation.updatedAt).toBe('2026-08-27T12:00:00.000Z')
  })

  it('restores list facts', () => {
    const conversation = Conversation.restore({
      id: ConversationIdSchema.parse('conversation-1'),
      cwd: '/repo/app',
      gitRoot: '/repo/',
      title: 'Open flow',
      updatedAt: IsoDateTimeSchema.parse('2026-08-27T12:00:00.000Z'),
    })
    expect(conversation.title).toBe('Open flow')
    expect(conversation.gitRoot).toBe('/repo')
  })
})
