import type { Conversation, ConversationCreationId } from '@porte/core/client'

/** One durable result for a logical conversation creation. */
export type ConversationCreationRecord = {
  readonly creationId: ConversationCreationId
  readonly cwd: string
  readonly conversation: Conversation
}

/** One durable claim before the provider receives a creation command. */
export type ConversationCreationClaim =
  | { readonly status: 'claimed' }
  | { readonly status: 'pending'; readonly cwd: string }
  | { readonly status: 'completed'; readonly record: ConversationCreationRecord }

/** Durable repeat safety for conversation creation only. */
export interface ConversationCreationStore {
  claim(creationId: ConversationCreationId, cwd: string): Promise<ConversationCreationClaim>
  complete(record: ConversationCreationRecord): Promise<void>
}
