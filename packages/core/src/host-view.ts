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
 * A paired Mac.
 *
 * `lastSeenAt` exists only while offline, so a live host cannot carry a stale
 * timestamp and an offline host cannot omit one.
 */
export const PairedHostSchema = z.discriminatedUnion('availability', [
  HostDescriptorSchema.extend({ availability: z.literal('online') }),
  HostDescriptorSchema.extend({
    availability: z.literal('offline'),
    lastSeenAt: IsoDateTimeSchema,
  }),
])
export type PairedHost = z.infer<typeof PairedHostSchema>

/** The account's single Mac, or none. The first release pairs at most one. */
export const HostViewSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unpaired') }),
  z.object({
    state: z.literal('paired'),
    host: PairedHostSchema,
    conversations: z.array(ConversationSummarySchema),
    /** Conversations with a turn in flight. */
    runningConversationIds: z.array(ConversationIdSchema),
  }),
  z.object({ state: z.literal('revoked'), host: PairedHostSchema }),
])
export type HostView = z.infer<typeof HostViewSchema>

/** Outcome of unpairing, or of deleting the account. */
export const AccountActionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string().min(1) }),
])
export type AccountActionResult = z.infer<typeof AccountActionResultSchema>
