import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** The Host cannot start until this machine has a stored credential. */
export class HostNotPairedError extends TaggedError('HostNotPairedError')<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Not paired yet. Run `porte pair` first.', classification: 'terminal' })
  }
}

/** The reason that an active pairing attempt did not produce a credential. */
export type PairingFailure = 'denied' | 'expired' | 'unreachable' | 'unexpected'

/** An active pairing attempt did not produce a credential. */
export class PairingError extends TaggedError('PairingError')<{
  cause: unknown
  reason: PairingFailure
  message: string
  classification: FailureClassification
}> {
  constructor(args: { reason: PairingFailure; cause?: unknown }) {
    super({
      cause: args.cause,
      reason: args.reason,
      message: MESSAGES[args.reason],
      classification: CLASSIFICATIONS[args.reason],
    })
  }
}

const MESSAGES = {
  denied: 'Pairing was cancelled in the browser. Run porte pair again to retry.',
  expired: 'The code expired before anyone approved it. Run porte pair for a new one.',
  unreachable: 'Could not reach Porte. Check the connection, then run porte pair again.',
  unexpected: 'Porte returned an unexpected response.',
} satisfies Record<PairingFailure, string>

const CLASSIFICATIONS = {
  denied: 'terminal',
  expired: 'terminal',
  unreachable: 'transient',
  unexpected: 'terminal',
} satisfies Record<PairingFailure, FailureClassification>
