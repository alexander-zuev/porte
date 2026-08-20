import { z } from 'zod'

import { EventIdSchema, ConversationIdSchema, TurnIdSchema } from './identity.ts'

/** One ordered entry in the current coding-agent plan. */
export const PlanEntrySchema = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['high', 'medium', 'low']),
})

/** One ordered entry in the current coding-agent plan. */
export type PlanEntry = z.infer<typeof PlanEntrySchema>

/** Current context usage and optional cumulative cost for one conversation. */
export const ConversationUsageSchema = z
  .object({
    usedTokens: z.number().int().nonnegative(),
    sizeTokens: z.number().int().nonnegative(),
    cost: z.object({ amount: z.number().nonnegative(), currency: z.string().min(1) }).optional(),
  })
  .refine((usage) => usage.usedTokens <= usage.sizeTokens, {
    error: 'Used tokens cannot exceed context size',
  })

/** Current context usage and optional cumulative cost for one conversation. */
export type ConversationUsage = z.infer<typeof ConversationUsageSchema>

const progressEventDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('plan.updated'),
    turnId: TurnIdSchema,
    entries: z.array(PlanEntrySchema),
  }),
  z.object({ type: z.literal('conversation.usage.updated'), usage: ConversationUsageSchema }),
])

/** Canonical plan or usage replacement for one conversation. */
export const ConversationProgressEventSchema = z.intersection(
  z.object({ eventId: EventIdSchema, conversationId: ConversationIdSchema }),
  progressEventDataSchema,
)

/** Canonical plan or usage replacement for one conversation. */
export type ConversationProgressEvent = z.infer<typeof ConversationProgressEventSchema>
