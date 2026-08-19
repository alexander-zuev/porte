import { z } from 'zod'

import { EventIdSchema, SessionIdSchema, TurnIdSchema } from './identity.ts'

/** One ordered entry in the current coding-agent plan. */
export const PlanEntrySchema = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['high', 'medium', 'low']),
})

/** One ordered entry in the current coding-agent plan. */
export type PlanEntry = z.infer<typeof PlanEntrySchema>

/** Current context usage and optional cumulative cost for one session. */
export const SessionUsageSchema = z
  .object({
    usedTokens: z.number().int().nonnegative(),
    sizeTokens: z.number().int().nonnegative(),
    cost: z.object({ amount: z.number().nonnegative(), currency: z.string().min(1) }).optional(),
  })
  .refine((usage) => usage.usedTokens <= usage.sizeTokens, {
    error: 'Used tokens cannot exceed context size',
  })

/** Current context usage and optional cumulative cost for one session. */
export type SessionUsage = z.infer<typeof SessionUsageSchema>

const progressEventDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('plan.updated'),
    turnId: TurnIdSchema,
    entries: z.array(PlanEntrySchema),
  }),
  z.object({ type: z.literal('session.usage.updated'), usage: SessionUsageSchema }),
])

/** Canonical plan or usage replacement for one coding session. */
export const CodingSessionProgressEventSchema = z.intersection(
  z.object({ eventId: EventIdSchema, sessionId: SessionIdSchema }),
  progressEventDataSchema,
)

/** Canonical plan or usage replacement for one coding session. */
export type CodingSessionProgressEvent = z.infer<typeof CodingSessionProgressEventSchema>
