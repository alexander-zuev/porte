import { z } from 'zod'

import { ConversationSummarySchema } from './conversation.ts'
import { HostDescriptorSchema } from './host.ts'
import { IsoDateTimeSchema, ConversationIdSchema } from './identity.ts'

/**
 * Contract for what a signed-in account controls right now.
 *
 * Loading and error are absent by design. They describe a request, not the
 * account, and belong to whichever client layer performs the fetch.
 */

/**
 * A paired Mac, as the database knows it.
 *
 * There is no availability here. Whether a Mac is reachable is a live question
 * the relay answers, and a read that guessed at it would be a second version of
 * a fact it cannot see. `lastSeenAt` is null until a daemon has announced
 * itself, because approving a grant is not an observation of one.
 */
export const PairedHostSchema = HostDescriptorSchema.extend({
  lastSeenAt: IsoDateTimeSchema.nullable(),
})
export type PairedHost = z.infer<typeof PairedHostSchema>

/** The account's single Mac, or none. The first release pairs at most one. */
export const HostViewSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unpaired') }),
  // No conversations here. They live on the Mac and arrive over the relay, so a
  // copy in this read would be a second list that can disagree with the first.
  z.object({ state: z.literal('paired'), host: PairedHostSchema }),
  z.object({ state: z.literal('revoked'), host: PairedHostSchema }),
])
export type HostView = z.infer<typeof HostViewSchema>

/** Outcome of unpairing, or of deleting the account. */
export const AccountActionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string().min(1) }),
])
export type AccountActionResult = z.infer<typeof AccountActionResultSchema>
