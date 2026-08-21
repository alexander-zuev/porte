import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const PAIRING_NOT_FOUND_ERROR = 'PairingNotFoundError'
export const PAIRING_EXPIRED_ERROR = 'PairingExpiredError'

/** No pairing attempt matches the code presented. */
export class PairingNotFoundError extends TaggedError(PAIRING_NOT_FOUND_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'That pairing code is not recognised', classification: 'terminal' })
  }
}

/** The code was real and its lifetime ran out before anyone answered. */
export class PairingExpiredError extends TaggedError(PAIRING_EXPIRED_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'That pairing code has expired', classification: 'terminal' })
  }
}
