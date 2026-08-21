import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/**
 * The environment holds a value this process cannot use.
 *
 * Separate from a usage error: the argv was fine, the surroundings were not, so
 * the fix is a variable rather than a different command.
 */
export class ConfigError extends TaggedError('ConfigError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** The credential file could not be read, written, or removed. */
export class CredentialStoreError extends TaggedError('CredentialStoreError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message: 'could not access the stored Porte credential',
      classification: 'terminal',
    })
  }
}

/**
 * The relay answered the handshake with a status instead of upgrading.
 *
 * Terminal: a refused credential does not become accepted by asking again, so
 * this ends the run rather than joining the reconnect loop.
 */
export class RelayHandshakeRefused extends TaggedError('RelayHandshakeRefused')<{
  status: number
  message: string
  classification: FailureClassification
}> {
  constructor(args: { status: number }) {
    super({
      ...args,
      message: `Porte refused the connection (HTTP ${String(args.status)})`,
      classification: 'terminal',
    })
  }
}

/** The Porte relay stopped because local handling failed. */
export class HostRelayError extends TaggedError('HostRelayError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'host relay stopped', classification: 'unknown' })
  }
}
