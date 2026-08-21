import { TaggedError } from 'better-result'

import type { FailureClassification } from './failure-classification.ts'

export const AUTHENTICATION_ERROR = 'AuthenticationError'
export const STALE_SESSION_ERROR = 'StaleSessionError'

/** Missing or invalid session for a surface that requires an account. */
export class AuthenticationError extends TaggedError(AUTHENTICATION_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Authentication required', classification: 'terminal' })
  }
}

/**
 * A session cookie was presented but no longer resolves.
 *
 * Separate from `AuthenticationError` because the entrypoint treats it
 * differently: this person had an account and was signed out by expiry or
 * revocation, so their cookies are cleared and the surface says so instead of
 * pretending they never signed in.
 */
export class StaleSessionError extends TaggedError(STALE_SESSION_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Session expired', classification: 'terminal' })
  }
}

export const NOT_AUTHORIZED_ERROR = 'NotAuthorizedError'

/** The caller is who they say, and still may not do this. */
export class NotAuthorizedError extends TaggedError(NOT_AUTHORIZED_ERROR)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Not allowed', classification: 'terminal' })
  }
}
