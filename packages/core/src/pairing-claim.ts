import { z } from 'zod'

import { HostDescriptorSchema } from './host.ts'

/**
 * The code the CLI prints and the person types.
 *
 * Eight characters is the plugin's own default. It leaves a space large enough
 * that guessing stays impractical even if a rate limiter were to fail open.
 */
export const PAIRING_CODE_LENGTH = 8

export const PairingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8}$/, { error: 'Enter the eight characters shown in the terminal' })
export type PairingCode = z.infer<typeof PairingCodeSchema>

/**
 * What claiming a pairing attempt returns.
 *
 * A claim never pairs on its own. The best case is a request to confirm, which
 * still needs the phrase to match on both devices.
 */
export const PairingClaimSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('confirm'),
    host: HostDescriptorSchema,
    /** The Porte account doing the pairing, shown so the user can check it. */
    accountLabel: z.string().min(1),
    verificationPhrase: z.string().min(1),
  }),
  z.object({ state: z.literal('invalid') }),
  z.object({ state: z.literal('expired') }),
  z.object({ state: z.literal('consumed') }),
  z.object({ state: z.literal('account-conflict') }),
  z.object({ state: z.literal('host-disconnected') }),
  z.object({ state: z.literal('server-unavailable') }),
])
export type PairingClaim = z.infer<typeof PairingClaimSchema>

/** What confirming the phrase returns. */
export const PairingConfirmationSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('paired'), host: HostDescriptorSchema }),
  z.object({ state: z.literal('waiting-for-desktop') }),
  z.object({ state: z.literal('confirmation-mismatch') }),
  z.object({ state: z.literal('host-disconnected') }),
  z.object({ state: z.literal('server-unavailable') }),
])
export type PairingConfirmation = z.infer<typeof PairingConfirmationSchema>
