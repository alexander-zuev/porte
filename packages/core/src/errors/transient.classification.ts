import { z } from 'zod'

import {
  CLOUDFLARE_TRANSIENT_ERROR_PATTERNS,
  isCloudflareObjectResetError,
} from './cloudflare.classification.ts'

const TRANSIENT_PLATFORM_PATTERNS = [
  CLOUDFLARE_TRANSIENT_ERROR_PATTERNS.objectReset,
  CLOUDFLARE_TRANSIENT_ERROR_PATTERNS.codeUpdateReset,
  CLOUDFLARE_TRANSIENT_ERROR_PATTERNS.objectMoved,
]

const TRANSIENT_TRANSPORT_PATTERNS = [
  /network/,
  /fetch failed/,
  /timeout/,
  /timed?\s*out/,
  /connection.*(lost|reset|refused|closed|aborted)/,
  /econnreset/,
  /econnrefused/,
  /etimedout/,
  /eai_again/,
]

const namedSchema = z.object({ name: z.string() })

/** What a thrown value says about itself. Anything else says nothing. */
function messageOf(cause: unknown): string | null {
  return cause instanceof Error ? cause.message.toLowerCase() : null
}

/** Cancellation, which is a decision rather than a failure to repeat. */
export function isAbortError(cause: unknown): boolean {
  const parsed = namedSchema.safeParse(cause)
  return parsed.success && parsed.data.name === 'AbortError'
}

/** Match known transient transport messages while excluding explicit cancellation. */
export function isTransientTransportError(cause: unknown): boolean {
  if (isAbortError(cause)) return false

  const message = messageOf(cause)
  return message !== null && TRANSIENT_TRANSPORT_PATTERNS.some((pattern) => pattern.test(message))
}

/** Match transient Cloudflare runtime evidence without general transport failures. */
export function isTransientCloudflareRuntimeError(cause: unknown): boolean {
  if (isCloudflareObjectResetError(cause)) return true

  const message = messageOf(cause)
  return message !== null && TRANSIENT_PLATFORM_PATTERNS.some((pattern) => pattern.test(message))
}
