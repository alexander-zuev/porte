import type { PairingClaim, PairingCode } from '@porte/core'

import type { PairingAuthority } from '../ports/pairing-authority.ts'

/**
 * Bind a pairing code to the account that is signed in.
 *
 * Claiming and deciding are separate on purpose. A person about to hand a Mac
 * an account needs a moment to read what they are about to do, after the code
 * resolves and before anything is granted.
 */
export async function claimPairing(
  authority: PairingAuthority,
  code: PairingCode,
): Promise<PairingClaim> {
  return authority.claim(code)
}
