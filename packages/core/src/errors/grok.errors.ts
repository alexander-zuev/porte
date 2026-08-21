import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const GROK_UNAVAILABLE_ERROR = 'GrokUnavailableError'

/** The coding agent could not be started, or stopped answering. */
export class GrokUnavailableError extends TaggedError(GROK_UNAVAILABLE_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Grok is unavailable on this Mac', classification: 'transient' })
  }
}
