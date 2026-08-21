import { TaggedError } from 'better-result'

import { classifyDurableObjectError } from './durable-object.classification.ts'
import type { FailureClassification } from './failure-classification.ts'

/**
 * One Durable Object call failed, after retries stopped.
 *
 * The raw failure stays as `cause`, flags and all. `classification` says what
 * the failure was, never whether to repeat it: that depends on the operation
 * and on who is asking, which only the next boundary knows.
 */
export class DurableObjectCallError extends TaggedError('DurableObjectCallError')<{
  cause: unknown
  classification: FailureClassification
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({
      cause: args.cause,
      classification: classifyDurableObjectError(args.cause),
      message: 'Durable Object call failed',
    })
  }
}
