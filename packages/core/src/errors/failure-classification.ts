import { TaggedError, type AnyTaggedError } from 'better-result'
import { z } from 'zod'

import {
  isCloudflareOverloadedError,
  isCloudflareRetryableError,
} from './cloudflare.classification.ts'
import {
  isAbortError,
  isTransientCloudflareRuntimeError,
  isTransientTransportError,
} from './transient.classification.ts'

/** What one failure is, before any policy decides what to do about it. */
export const FailureClassificationSchema = z.enum(['transient', 'terminal', 'unknown'])
export type FailureClassification = z.infer<typeof FailureClassificationSchema>

/**
 * Every error Porte raises says what kind of failure it is.
 *
 * Declared where the error is defined, so no boundary has to guess and no table
 * anywhere restates it. A value that fails this guard came from outside and was
 * never wrapped, which is the definition of a failure nobody judged.
 */
export type ClassifiedError = AnyTaggedError & { classification: FailureClassification }

const classifiedSchema = z.object({ classification: FailureClassificationSchema })

export function isClassifiedError(cause: unknown): cause is ClassifiedError {
  return TaggedError.is(cause) && classifiedSchema.safeParse(cause).success
}

/** One boundary's own rules. Undefined hands the failure to the shared ones. */
export type BoundaryErrorClassifier = (cause: unknown) => FailureClassification | undefined

/** Classify one raw external error through boundary, Cloudflare, then global rules. */
export function classifyBoundaryError(args: {
  cause: unknown
  classifyBoundary: BoundaryErrorClassifier
  includeCloudflare: boolean
}): FailureClassification {
  const boundary = args.classifyBoundary(args.cause)
  if (boundary !== undefined) return boundary

  if (isAbortError(args.cause)) return 'terminal'

  if (
    args.includeCloudflare &&
    (isCloudflareOverloadedError(args.cause) ||
      isCloudflareRetryableError(args.cause) ||
      isTransientCloudflareRuntimeError(args.cause))
  ) {
    return 'transient'
  }

  if (isTransientTransportError(args.cause)) return 'transient'

  return 'unknown'
}
