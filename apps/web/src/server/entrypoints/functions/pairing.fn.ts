import type { PairingClaim, PairingDecision } from '@porte/core'
import { PairingCodeSchema, PairingDecisionInputSchema } from '@porte/core'
import { createServerFn } from '@tanstack/react-start'

import { claimPairing as claimPairingCommand } from '../../application/commands/claim-pairing.command.ts'
import { decidePairing as decidePairingCommand } from '../../application/commands/decide-pairing.command.ts'
import { requireAuth } from '../middleware/auth.middleware.ts'

/**
 * Pairing entrypoints for the browser.
 *
 * `requireAuth` resolves the account, so each handler only dispatches. The
 * device authorization plugin owns the code's whole life behind
 * `deps.pairingAuthority`; see docs/ux-flows.md, Pairing Implementation Decision.
 */

/** Bind a code to this account, so it can then be decided. */
export const claimPairing = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(PairingCodeSchema)
  .handler(async ({ data, context }): Promise<PairingClaim> => {
    return claimPairingCommand(context.deps.pairingAuthority, data)
  })

/** Settle a claimed code, either way. Approval lets the Mac have a session. */
export const decidePairing = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(PairingDecisionInputSchema)
  .handler(async ({ data, context }): Promise<PairingDecision> => {
    return decidePairingCommand(context.deps.pairingAuthority, data.code, data.verdict)
  })
