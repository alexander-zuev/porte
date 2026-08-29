import { z } from 'zod'

import { HostIdSchema, IsoDateTimeSchema } from '../identity/identity.ts'
import { HostDescriptorSchema } from './host.ts'

/**
 * Which machine an account owns, if any.
 *
 * Durable facts only. Nothing here says whether the machine can be reached or what
 * is on it, because the database cannot see either; the relay answers both.
 * Loading and error are absent for the same reason: they describe a request,
 * not the account.
 */

/**
 * A paired machine, as the database knows it.
 *
 * There is no availability here. Whether a machine is reachable is a live question
 * the relay answers, and a read that guessed at it would be a second version of
 * a fact it cannot see. `lastSeenAt` is null until a daemon has announced
 * itself, because approving a grant is not an observation of one.
 */
export const PairedHostSchema = HostDescriptorSchema.extend({
  /** Names the pairing's relay object; a re-pair after unpair gets a new one. */
  id: HostIdSchema,
  lastSeenAt: IsoDateTimeSchema.nullable(),
})
export type PairedHost = z.infer<typeof PairedHostSchema>

/** The account's single machine, or none. The first release pairs at most one. */
export const AccountHostSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unpaired') }),
  // No conversations here. They live on the machine and arrive over the relay, so a
  // copy in this read would be a second list that can disagree with the first.
  z.object({ state: z.literal('paired'), host: PairedHostSchema }),
  z.object({ state: z.literal('revoked'), host: PairedHostSchema }),
])
export type AccountHost = z.infer<typeof AccountHostSchema>

/**
 * Whether the relay is holding the machine's socket, right now.
 *
 * The live half of the pair `PairedHost` deliberately omits, read separately
 * because only the relay can answer it. Shaped like the `host.status` event on
 * purpose: a frame that arrives can replace this value without being mapped.
 */
export const HostStatusSchema = z.object({ status: z.enum(['online', 'offline']) })
export type HostStatus = z.infer<typeof HostStatusSchema>

/** Outcome of unpairing, or of deleting the account. */
export const AccountActionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string().min(1) }),
])
export type AccountActionResult = z.infer<typeof AccountActionResultSchema>
