import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** The conversation is already open on this process; open it once. */
export class ConversationAlreadyOpenError extends TaggedError('ConversationAlreadyOpenError')<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Conversation is already open.', classification: 'terminal' })
  }
}
