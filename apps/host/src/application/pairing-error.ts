import { TaggedError } from 'better-result'

/**
 * Pairing did not produce a credential.
 *
 * `reason` is what the person needs to hear, and each value maps to a different
 * next action: retry, approve, start over, or report a bug.
 */
export type PairingFailure =
  /** The person rejected the request on their phone. */
  | 'denied'
  /** Nobody approved before the code expired. */
  | 'expired'
  /** The Porte server could not be reached. */
  | 'unreachable'
  /** The server answered, but not with anything the grant defines. */
  | 'unexpected'

export class PairingError extends TaggedError('PairingError')<{
  cause: unknown
  reason: PairingFailure
  message: string
}> {
  constructor(args: { reason: PairingFailure; cause?: unknown }) {
    super({ cause: args.cause, reason: args.reason, message: MESSAGES[args.reason] })
  }
}

const MESSAGES = {
  denied: 'Pairing was cancelled in the browser. Run porte pair again to retry.',
  expired: 'The code expired before anyone approved it. Run porte pair for a new one.',
  unreachable: 'Could not reach Porte. Check the connection, then run porte pair again.',
  unexpected: 'Porte returned an unexpected response.',
} satisfies Record<PairingFailure, string>
