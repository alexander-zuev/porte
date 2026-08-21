import { z } from 'zod'

import {
  isCloudflareOverloadedError,
  isCloudflareRetryableError,
} from './cloudflare.classification.ts'
import { classifyBoundaryError, type FailureClassification } from './failure-classification.ts'
import {
  isTransientCloudflareRuntimeError,
  isTransientTransportError,
} from './transient.classification.ts'

/** An RPC failure wraps the reason it failed, so the chain is what to read. */
const wrappedSchema = z.object({ cause: z.unknown() })

/** Deep enough for any real chain, and a bound rather than a cycle guard. */
const MAX_CAUSE_DEPTH = 8

/**
 * The Durable Object boundary's own rules, read down the whole cause chain.
 *
 * An overload anywhere wins. It is the one transient-looking failure that
 * repeating makes worse, so it is terminal for whoever is holding a caller.
 */
function classifyDurableObjectBoundary(cause: unknown): FailureClassification | undefined {
  let current = cause
  let transient = false

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (isCloudflareOverloadedError(current)) return 'terminal'
    if (isRepeatable(current)) transient = true

    const wrapped = wrappedSchema.safeParse(current)
    if (!wrapped.success) break
    current = wrapped.data.cause
  }

  return transient ? 'transient' : undefined
}

/** Classify one raw Durable Object failure. */
export function classifyDurableObjectError(cause: unknown): FailureClassification {
  return classifyBoundaryError({
    cause,
    classifyBoundary: classifyDurableObjectBoundary,
    includeCloudflare: true,
  })
}

function isRepeatable(cause: unknown): boolean {
  return (
    isCloudflareRetryableError(cause) ||
    isTransientCloudflareRuntimeError(cause) ||
    isTransientTransportError(cause)
  )
}
