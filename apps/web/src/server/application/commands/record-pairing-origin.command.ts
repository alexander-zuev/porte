import type {
  PairingOrigins,
  PairingRequestRecord,
} from '@server/application/ports/pairing-origins.ts'

/**
 * Remember where a pairing code was asked for.
 *
 * Written the moment a code exists, because only that request knows which
 * machine wanted it. What the confirmation screen makes of it is decided when
 * the code is claimed, not here.
 */
export async function recordPairingOrigin(
  origins: PairingOrigins,
  userCode: string,
  request: PairingRequestRecord,
): Promise<void> {
  await origins.record(userCode, request)
}
