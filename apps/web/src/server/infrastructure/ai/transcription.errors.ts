import { classifyBoundaryError, type FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/**
 * Codes from developers.cloudflare.com/workers-ai/platform/errors (read 2026-09-01).
 * Transient: out of capacity (3040) and timeout (3007) — repeating an idempotent
 * transcription is safe. Everything else documented is terminal: bad input,
 * quota, plan, model, or a cancellation.
 */
const TRANSIENT_CODES = new Set([3007, 3040])
const TERMINAL_CODES = new Set([
  3003, 3006, 3008, 3023, 3036, 3039, 3041, 3042, 5004, 5005, 5007, 5016, 5018, 5019, 5035,
])

/** The binding throws a plain Error whose message carries the Workers AI code. */
function classifyWorkersAiError(cause: unknown): FailureClassification | undefined {
  if (!(cause instanceof Error)) return undefined
  const code = Number(/\b(\d{4})\b/.exec(cause.message)?.[1])
  if (TRANSIENT_CODES.has(code)) return 'transient'
  if (TERMINAL_CODES.has(code)) return 'terminal'
  return undefined
}

export const TRANSCRIPTION_FAILED_ERROR = 'TranscriptionFailedError'

/**
 * One transcription failed, after retries stopped. The raw failure stays as
 * `cause`; `classification` says what it was, so a later owner can still judge.
 */
export class TranscriptionFailedError extends TaggedError(TRANSCRIPTION_FAILED_ERROR)<{
  cause: unknown
  classification: FailureClassification
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({
      cause: args.cause,
      classification: classifyBoundaryError({
        cause: args.cause,
        classifyBoundary: classifyWorkersAiError,
        includeCloudflare: true,
      }),
      message: 'Voice transcription failed',
    })
  }
}
