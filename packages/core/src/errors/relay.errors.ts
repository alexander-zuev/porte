import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const OPERATION_CONFLICT_ERROR = 'OperationConflictError'
export const OPERATION_EXPIRED_ERROR = 'OperationExpiredError'

/** One operation identifier already owns different command data. */
export class OperationConflictError extends TaggedError(OPERATION_CONFLICT_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({
      message: 'Operation ID already identifies another command',
      classification: 'terminal',
    })
  }
}

/** The relay stopped delivery before the host accepted this operation. */
export class OperationExpiredError extends TaggedError(OPERATION_EXPIRED_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Operation expired before delivery', classification: 'terminal' })
  }
}
