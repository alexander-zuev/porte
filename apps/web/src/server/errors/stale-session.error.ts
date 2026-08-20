/**
 * A session cookie was presented but no longer resolves.
 *
 * Separate from `AuthenticationError` because the client should treat it
 * differently: this person had an account and was signed out by expiry or
 * revocation, so the surface says so instead of pretending they never signed in.
 */
export class StaleSessionError extends Error {
  readonly _tag = 'StaleSessionError' as const
  readonly code = 'SESSION_EXPIRED' as const

  constructor() {
    super('Session expired')
    this.name = 'StaleSessionError'
  }
}
