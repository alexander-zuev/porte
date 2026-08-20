import { z } from 'zod'

import { IsoDateTimeSchema } from './identity.ts'

/**
 * The code the CLI prints and the person types.
 *
 * Eight characters is the plugin's own default. It leaves a space large enough
 * that guessing stays impractical even if a rate limiter were to fail open.
 */
export const PAIRING_CODE_LENGTH = 8

/**
 * Ten minutes: long enough to walk to a phone and sign in, short enough that a
 * seen code dies. Seconds, so the authority's time string and the sweep that
 * forgets a stale request both derive from one number.
 */
export const PAIRING_CODE_LIFETIME_SECONDS = 600

/** The dash is optional: it is printed for readability and stripped on arrival. */
export const PairingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/, {
    error: 'Enter the eight characters shown in the terminal',
  })
  // The terminal shows the code split in half, so a person types the dash that
  // the authority never stored. One spelling reaches everything downstream.
  .transform((code) => code.replace('-', ''))
export type PairingCode = z.infer<typeof PairingCodeSchema>

/** Split the code in half so the eye can hold it between screen and keyboard. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/**
 * What claiming a pairing code returns.
 *
 * Claiming binds a pending code to the signed-in account and nothing more. The
 * person still has to decide, which is the whole reason the two steps are
 * separate. Which account they are signed in as is already on the page, so a
 * claim does not repeat it.
 */
/**
 * Where the code was asked for, judged against where it is being answered.
 *
 * The server compares, not the screen. Both halves normally happen on one Mac,
 * so `elsewhere` is the whole signal: someone else's machine asked for a code
 * you are about to approve.
 */
export const PairingOriginSchema = z.discriminatedUnion('origin', [
  z.object({ origin: z.literal('this-device'), requestedAt: IsoDateTimeSchema }),
  z.object({
    origin: z.literal('elsewhere'),
    /** City and country as far as they are known, else the country alone. */
    location: z.string().min(1),
    ipAddress: z.string().min(1),
    requestedAt: IsoDateTimeSchema,
  }),
  /** Nothing was recorded. Never blocks pairing; the screen simply says less. */
  z.object({ origin: z.literal('unknown') }),
])
export type PairingOrigin = z.infer<typeof PairingOriginSchema>

export const PairingClaimSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('claimed'), requestedFrom: PairingOriginSchema }),
  z.object({ state: z.literal('invalid') }),
  z.object({ state: z.literal('expired') }),
  z.object({ state: z.literal('already-decided') }),
])
export type PairingClaim = z.infer<typeof PairingClaimSchema>

/** What the person chose about a Mac that is waiting on a code. */
export const PairingVerdictSchema = z.enum(['approve', 'deny'])
export type PairingVerdict = z.infer<typeof PairingVerdictSchema>

/**
 * What approving or denying a claimed code returns.
 *
 * One shape for both, because the two decisions can fail in exactly the same
 * ways. `not-yours` is the race where another account claimed the code first;
 * claiming cannot detect it, so it surfaces here.
 */
export const PairingDecisionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('done') }),
  z.object({ state: z.literal('expired') }),
  z.object({ state: z.literal('already-decided') }),
  z.object({ state: z.literal('not-yours') }),
])
export type PairingDecision = z.infer<typeof PairingDecisionSchema>
