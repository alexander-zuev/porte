import { PAIRING_CODE_LIFETIME_SECONDS, createLogger } from '@porte/core'

import type { PairingOrigins } from '../ports/pairing-origins.ts'

const logger = createLogger('pairing')

/**
 * Forget requests whose code can no longer be decided.
 *
 * A record is dropped when its code is decided, so only abandoned attempts
 * remain. Their address outlives the question it was kept to answer, and the
 * code they belong to is already dead, so nothing can read them again.
 *
 * Returns how many it forgot, so a caller can assert on it.
 */
export async function forgetStalePairingRequests(
  origins: PairingOrigins,
  now: Date,
): Promise<number> {
  const expiry = new Date(now.getTime() - PAIRING_CODE_LIFETIME_SECONDS * 1000)
  const forgotten = await origins.forgetRequestedBefore(expiry)

  // Silent when there was nothing to forget: this runs every quarter hour, and
  // Cloudflare's invocation log already records that the sweep happened.
  if (forgotten > 0) logger.info('pairing_requests_forgotten', { forgotten })

  return forgotten
}
