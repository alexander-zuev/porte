import { ConversationAlreadyOpenError } from '@host/domain/conversation/conversation-errors.ts'
import type { Conversation } from '@host/domain/conversation/conversation.ts'
import type { ConversationRepository } from '@host/domain/repositories/conversation-repository.ts'
import type { EventOutbox } from '@host/infrastructure/persistence/event-outbox.ts'
import { type ConversationId, ConversationNotFoundError } from '@porte/core/client'

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly rows = new Map<ConversationId, Conversation>()

  constructor(private readonly outbox: EventOutbox) {}

  find(id: ConversationId): Conversation | null {
    return this.rows.get(id) ?? null
  }

  get(id: ConversationId): Conversation {
    const conversation = this.rows.get(id)
    if (conversation === undefined) throw new ConversationNotFoundError()
    return conversation
  }

  insert(conversation: Conversation): void {
    if (this.rows.has(conversation.id)) throw new ConversationAlreadyOpenError()
    this.rows.set(conversation.id, conversation)
    this.publish(conversation)
  }

  save(conversation: Conversation): void {
    if (!this.rows.has(conversation.id)) throw new ConversationNotFoundError()
    this.publish(conversation)
  }

  delete(conversation: Conversation): void {
    this.rows.delete(conversation.id)
    this.publish(conversation)
  }

  all(): readonly Conversation[] {
    return [...this.rows.values()]
  }

  private publish(conversation: Conversation): void {
    this.outbox.push(conversation.collectEvents())
    conversation.clearEvents()
  }
}
