import { ConversationAlreadyOpenError } from '@host/domain/conversation/conversation-errors.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import { EventOutbox } from '@host/infrastructure/persistence/event-outbox.ts'
import { InMemoryConversationRepository } from '@host/infrastructure/persistence/in-memory-conversation-repository.ts'
import {
  ConversationIdSchema,
  ConversationNotFoundError,
  MessageIdSchema,
  TurnIdSchema,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const id = ConversationIdSchema.parse('conversation-1')

function conversation(): Conversation {
  return Conversation.create({ id, cwd: '/repo', gitRoot: '/repo', now: new Date(0) })
}

describe('InMemoryConversationRepository', () => {
  it('moves raised events to the outbox on save and clears the aggregate', () => {
    const outbox = new EventOutbox()
    const repo = new InMemoryConversationRepository(outbox)
    const open = conversation()
    repo.insert(open)
    open.beginTurn(TurnIdSchema.parse('turn-1'), { id: MessageIdSchema.parse('m'), content: [] })
    repo.save(open)
    expect(outbox.drain().map((event) => event.name)).toEqual(
      Array(3).fill('ConversationEventRaised'),
    )
    expect(open.collectEvents()).toEqual([])
  })

  it('rejects a second insert and a get or save of an unknown conversation', () => {
    const repo = new InMemoryConversationRepository(new EventOutbox())
    repo.insert(conversation())
    expect(() => {
      repo.insert(conversation())
    }).toThrow(ConversationAlreadyOpenError)
    repo.delete(id)
    expect(repo.find(id)).toBeNull()
    expect(() => repo.get(id)).toThrow(ConversationNotFoundError)
    expect(() => {
      repo.save(conversation())
    }).toThrow(ConversationNotFoundError)
  })
})
