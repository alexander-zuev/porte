import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const CODING_AGENT_UNAVAILABLE_ERROR = 'CodingAgentUnavailableError'

/** The selected coding agent cannot accept work. */
export class CodingAgentUnavailableError extends TaggedError(CODING_AGENT_UNAVAILABLE_ERROR)<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'Coding agent is unavailable', classification: 'transient' })
  }
}
