import type { PairingClaim, PairingConfirmation } from '@porte/core'
import { PairingCodeSchema } from '@porte/core'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * Pairing entrypoints for the web client.
 *
 * Both handlers are stubs returning the contract shape. The relay that owns
 * pairing attempts is not wired yet.
 */

const ClaimInputSchema = z.object({ code: PairingCodeSchema })

/** Claim an attempt with the six-character code. Never pairs on its own. */
export const claimPairing = createServerFn({ method: 'POST' })
  .inputValidator(ClaimInputSchema)
  .handler(async (): Promise<PairingClaim> => ({ state: 'invalid' }))

/** Confirm that the phrase matches. The desktop must confirm too. */
export const confirmPairing = createServerFn({ method: 'POST' }).handler(
  async (): Promise<PairingConfirmation> => ({ state: 'waiting-for-desktop' }),
)
