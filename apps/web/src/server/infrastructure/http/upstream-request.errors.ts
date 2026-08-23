import { TaggedError } from 'better-result'

/** An external HTTP request failed before it produced usable data. */
export class UpstreamRequestError extends TaggedError('UpstreamRequestError')<{
  cause: unknown
  message: string
  classification: 'unknown'
}> {
  constructor(cause: unknown) {
    super({ cause, message: 'The upstream request failed', classification: 'unknown' })
  }
}

/** An external HTTP request did not finish before its deadline. */
export class UpstreamTimeoutError extends TaggedError('UpstreamTimeoutError')<{
  cause: unknown
  message: string
  classification: 'transient'
}> {
  constructor(cause: unknown) {
    super({ cause, message: 'The upstream request timed out', classification: 'transient' })
  }
}
