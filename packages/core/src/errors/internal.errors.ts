import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const INTERNAL_SERVER_ERROR = 'InternalServerError'
export const SERVICE_UNAVAILABLE_ERROR = 'ServiceUnavailableError'

/** What an unnamed failure becomes on its way out. Carries nothing. */
export class InternalServerError extends TaggedError(INTERNAL_SERVER_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Something went wrong', classification: 'unknown' })
  }
}

/**
 * The same, for an unnamed failure that looked temporary.
 *
 * Separate from `InternalServerError` so the classification decides which tag
 * to blank to and then stays here: the client reads a 503 and knows to come
 * back, without being told how we judged it.
 */
export class ServiceUnavailableError extends TaggedError(SERVICE_UNAVAILABLE_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Try again shortly', classification: 'transient' })
  }
}
