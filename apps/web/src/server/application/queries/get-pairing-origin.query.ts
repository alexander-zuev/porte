import { IsoDateTimeSchema, type PairingOrigin } from '@porte/core'

import type {
  PairingOrigins,
  PairingRequestRecord,
  RequestOrigin,
} from '../ports/pairing-origins.ts'

/** Where a code was asked for, judged against where it is being answered. */
export async function getPairingOrigin(
  origins: PairingOrigins,
  userCode: string,
  approvingFrom: string | null,
): Promise<PairingOrigin> {
  return resolveOrigin(await origins.find(userCode), approvingFrom)
}

/**
 * Judge one against the other.
 *
 * Both halves normally happen on one Mac, so a match is the quiet case and
 * needs no address on screen. A mismatch is the whole reason this exists.
 * Pure, so the comparison can be tested without a database.
 */
export function resolveOrigin(
  request: PairingRequestRecord | null,
  approvingFrom: string | null,
): PairingOrigin {
  if (request === null) return { origin: 'unknown' }

  const requestedAt = IsoDateTimeSchema.parse(request.requestedAt.toISOString())
  if (approvingFrom !== null && request.origin.ipAddress === approvingFrom) {
    return { origin: 'this-device', requestedAt }
  }

  return {
    origin: 'elsewhere',
    location: describe(request.origin),
    ipAddress: request.origin.ipAddress,
    requestedAt,
  }
}

/** City and country when both are known, whichever exists when one is not. */
function describe(origin: RequestOrigin): string {
  if (origin.city && origin.country) return `${origin.city}, ${origin.country}`
  return origin.city ?? origin.country ?? 'an unknown location'
}
