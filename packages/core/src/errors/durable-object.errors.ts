import { TaggedError } from 'better-result'
import { z } from 'zod'

import { classifyDurableObjectError } from './durable-object.classification.ts'
import {
  FailureClassificationSchema,
  type FailureClassification,
} from './failure-classification.ts'

/** Stable tag for one failed Durable Object call. */
export const DURABLE_OBJECT_CALL_ERROR = 'DurableObjectCallError'

const DurableObjectCallFailureSchema = z.object({
  _tag: z.literal(DURABLE_OBJECT_CALL_ERROR),
  cause: z.unknown(),
  classification: FailureClassificationSchema,
})
type DurableObjectCallFailure = Error & z.infer<typeof DurableObjectCallFailureSchema>

/** Identify a local or RPC-serialized Durable Object call failure. */
export function isDurableObjectCallError(cause: unknown): cause is DurableObjectCallFailure {
  return cause instanceof Error && DurableObjectCallFailureSchema.safeParse(cause).success
}

/**
 * One Durable Object call failed, after retries stopped.
 *
 * The raw failure stays as `cause`, flags and all. `classification` says what
 * the failure was, never whether to repeat it: that depends on the operation
 * and on who is asking, which only the next boundary knows.
 */
export class DurableObjectCallError extends TaggedError(DURABLE_OBJECT_CALL_ERROR)<{
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
