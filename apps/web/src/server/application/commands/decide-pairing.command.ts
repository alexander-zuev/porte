import type { PairingCode, PairingDecision, PairingVerdict } from '@porte/core'

import type { PairingAuthority } from '../ports/pairing-authority.ts'

/**
 * Settle a claimed pairing code.
 *
 * One handler for both answers, because they are the same act with opposite
 * outcomes and fail in identical ways. Nothing is written here: the Mac
 * registers itself when it first connects with the session it earns.
 */
export async function decidePairing(
  authority: PairingAuthority,
  code: PairingCode,
  verdict: PairingVerdict,
): Promise<PairingDecision> {
  return verdict === 'approve' ? authority.approve(code) : authority.deny(code)
}
