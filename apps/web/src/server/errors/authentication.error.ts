/** Missing or invalid session for a route that requires an account. */
export class AuthenticationError extends Error {
  readonly _tag = 'AuthenticationError' as const
  readonly code = 'UNAUTHENTICATED' as const

  constructor() {
    super('Authentication required')
    this.name = 'AuthenticationError'
  }
}
