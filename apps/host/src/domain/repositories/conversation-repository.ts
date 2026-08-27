import type { Conversation } from '@host/domain/conversation/conversation.ts'
import type { ConversationId } from '@porte/core/client'

/**
 * Conversations open on this process. `insert` and `save` hand the aggregate's
 * raised events to the outbox; nothing else publishes.
 */
export interface ConversationRepository {
  find(id: ConversationId): Conversation | null
  /** @throws ConversationNotFoundError */
  get(id: ConversationId): Conversation
  /** @throws ConversationAlreadyOpenError */
  insert(conversation: Conversation): void
  /** @throws ConversationNotFoundError */
  save(conversation: Conversation): void
  delete(id: ConversationId): void
  all(): readonly Conversation[]
}
