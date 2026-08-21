import { TaggedError } from 'better-result'
import { z } from 'zod'

import type { FailureClassification } from './failure-classification.ts'

/** One field a request got wrong, as the client may see it. */
export const ValidationIssueSchema = z.object({
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
})
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>

export const VALIDATION_ERROR = 'ValidationError'
export const UPGRADE_REQUIRED_ERROR = 'UpgradeRequiredError'
export const RATE_LIMITED_ERROR = 'RateLimitedError'
export const REQUEST_TIMEOUT_ERROR = 'RequestTimeoutError'

/**
 * A request said something the contract does not accept.
 *
 * User input only. A technical precondition is its own error, because the
 * issues here name fields a person can correct.
 */
export class ValidationError extends TaggedError(VALIDATION_ERROR)<{
  message: string
  issues: readonly ValidationIssue[]
  classification: FailureClassification
}> {
  constructor(issues: readonly ValidationIssue[], message = 'The request was not valid') {
    super({ message, issues, classification: 'terminal' })
  }

  /**
   * Zod says which fields, in its own shape. This is that shape on the wire.
   *
   * A path step may be a symbol, which no client can render, so the schema
   * keeps only the steps a person could be shown.
   */
  static fromZod(error: z.ZodError, message?: string): ValidationError {
    const issues = error.issues.map((issue) => ({
      message: issue.message,
      path: readablePath(issue.path),
    }))
    return new ValidationError(issues, message)
  }
}

/** A route that only answers a WebSocket received a plain request. */
export class UpgradeRequiredError extends TaggedError(UPGRADE_REQUIRED_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'WebSocket upgrade required', classification: 'terminal' })
  }
}

/** Too many requests from one caller. Waiting is the whole remedy. */
export class RateLimitedError extends TaggedError(RATE_LIMITED_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Too many requests', classification: 'transient' })
  }
}

/** Whoever was asked did not answer inside the deadline. */
export class RequestTimeoutError extends TaggedError(REQUEST_TIMEOUT_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'The request timed out', classification: 'transient' })
  }
}

const readablePathSchema = z.array(z.union([z.string(), z.number()]))

/** A path step may be a symbol, which no client can render. Those drop out. */
function readablePath(path: readonly PropertyKey[]): (string | number)[] {
  const parsed = readablePathSchema.safeParse(path)
  return parsed.success ? parsed.data : []
}
