import type {
  Conversation,
  ConversationCreationId,
  FailureClassification,
} from '@porte/core/client'
import { TaggedError, type Result } from 'better-result'

/** The Host could not read or write its conversation creation records. */
export class ConversationCreationStoreError extends TaggedError('ConversationCreationStoreError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message: 'could not access conversation creation records',
      classification: 'unknown',
    })
  }
}

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
  claim(
    creationId: ConversationCreationId,
    cwd: string,
  ): Promise<Result<ConversationCreationClaim, ConversationCreationStoreError>>
  complete(
    record: ConversationCreationRecord,
  ): Promise<Result<void, ConversationCreationStoreError>>
}
