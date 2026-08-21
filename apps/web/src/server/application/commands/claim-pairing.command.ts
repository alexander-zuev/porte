import type { PairingClaim, PairingCode } from '@porte/core'
import type { PairingAuthority } from '@server/application/ports/pairing-authority.ts'
import type { PairingOrigins } from '@server/application/ports/pairing-origins.ts'
import { getPairingOrigin } from '@server/application/queries/get-pairing-origin.query.ts'

/**
 * Bind a pairing code to the account that is signed in.
 *
 * Claiming and deciding are separate on purpose. A person about to hand a Mac
 * an account needs a moment to read what they are about to do, after the code
 * resolves and before anything is granted.
 */
export async function claimPairing(
  authority: PairingAuthority,
  origins: PairingOrigins,
  code: PairingCode,
  approvingFrom: string | null,
): Promise<PairingClaim> {
  const status = await authority.claim(code)
  if (status.state !== 'claimed') return status

  return { state: 'claimed', requestedFrom: await getPairingOrigin(origins, code, approvingFrom) }
}
