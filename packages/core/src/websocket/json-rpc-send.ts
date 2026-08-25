import { Result, TaggedError } from 'better-result'

import type { FailureClassification } from '../errors/failure-classification.ts'
import { shouldRetryFailure } from '../errors/retry-policy.ts'

/**
 * Bounded, jittered, and short: a caller is waiting on the other side of this.
 * `times` counts repeats after the first call, so this is three writes at most.
 */
const SEND_RETRY = { times: 2, delayMs: 25, backoff: 'exponential', jitter: true } as const

/** Writing one JSON-RPC frame to the socket failed. */
export class JsonRpcSendError extends TaggedError('JsonRpcSendError')<{
  cause: unknown
  neverLeft: boolean
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause?: unknown; neverLeft: boolean }) {
    super({
      cause: args.cause,
      neverLeft: args.neverLeft,
      message: args.neverLeft ? 'JSON-RPC frame was not sent' : 'JSON-RPC send failed',
      classification: args.neverLeft ? 'transient' : 'unknown',
    })
  }
}

/**
 * Write one JSON-RPC frame. Retry only when the bytes never left the process.
 *
 * `write` returns `false` when the socket did not accept the frame.
 */
export async function sendJsonRpcFrame(write: () => boolean | void): Promise<void> {
  const sent = await Result.tryPromise(
    {
      try: async () => {
        if (write() === false) throw new JsonRpcSendError({ neverLeft: true })
      },
      catch: (cause) =>
        cause instanceof JsonRpcSendError
          ? cause
          : new JsonRpcSendError({ cause, neverLeft: false }),
    },
    {
      retry: {
        ...SEND_RETRY,
        shouldRetry: (error) =>
          shouldRetryFailure({
            classification: error.classification,
            repeatSafe: error.neverLeft,
            owner: 'immediate',
          }),
      },
    },
  )
  if (sent.isErr()) throw sent.error
}
