import { TaggedError } from 'better-result'

/**
 * The environment holds a value this process cannot use.
 *
 * Separate from a usage error: the argv was fine, the surroundings were not, so
 * the fix is a variable rather than a different command.
 */
export class ConfigError extends TaggedError('ConfigError')<{
  message: string
}> {}

/** The credential file could not be read, written, or removed. */
export class CredentialStoreError extends TaggedError('CredentialStoreError')<{
  cause: unknown
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'could not access the stored Porte credential' })
  }
}

/** The Porte relay stopped because local handling failed. */
export class HostRelayError extends TaggedError('HostRelayError')<{
  cause: unknown
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'host relay stopped' })
  }
}
