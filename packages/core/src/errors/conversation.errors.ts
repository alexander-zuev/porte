import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const CONVERSATION_NOT_FOUND_ERROR = 'ConversationNotFoundError'
export const CONVERSATION_BUSY_ERROR = 'ConversationBusyError'
export const TURN_NOT_FOUND_ERROR = 'TurnNotFoundError'
export const PERMISSION_NOT_FOUND_ERROR = 'PermissionNotFoundError'

/** No open conversation answers to that identifier. */
export class ConversationNotFoundError extends TaggedError(CONVERSATION_NOT_FOUND_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Conversation is not open.', classification: 'terminal' })
  }
}

/** One conversation runs one turn. The current one has to end first. */
export class ConversationBusyError extends TaggedError(CONVERSATION_BUSY_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Conversation already has an active turn.', classification: 'transient' })
  }
}

/** The turn named has already ended, or never started. */
export class TurnNotFoundError extends TaggedError(TURN_NOT_FOUND_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Turn is not running.', classification: 'terminal' })
  }
}

/** The permission request was answered already, or withdrawn. */
export class PermissionNotFoundError extends TaggedError(PERMISSION_NOT_FOUND_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Permission request is not pending.', classification: 'terminal' })
  }
}
