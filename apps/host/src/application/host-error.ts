import { TaggedError } from 'better-result'

/** The Porte relay stopped because local handling failed. */
export class HostRelayError extends TaggedError('HostRelayError')<{
  cause: unknown
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'host relay stopped' })
  }
}
