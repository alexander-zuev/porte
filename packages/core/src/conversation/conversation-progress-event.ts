import { z } from 'zod'

import { TurnIdSchema } from '../identity/identity.ts'

/** One ordered entry in the current coding-agent plan. */
export const PlanEntrySchema = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['high', 'medium', 'low']),
})

/** One ordered entry in the current coding-agent plan. */
export type PlanEntry = z.infer<typeof PlanEntrySchema>

/** One complete ACP plan with its provider ID and content form. */
export const ConversationPlanSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('items'),
    planId: z.string().min(1),
    entries: z.array(PlanEntrySchema),
  }),
  z.object({ type: z.literal('file'), planId: z.string().min(1), uri: z.string().min(1) }),
  z.object({ type: z.literal('markdown'), planId: z.string().min(1), content: z.string() }),
])

/** One complete ACP plan with its provider ID and content form. */
export type ConversationPlan = z.infer<typeof ConversationPlanSchema>

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
    plan: ConversationPlanSchema,
  }),
  z.object({ type: z.literal('plan.removed'), turnId: TurnIdSchema, planId: z.string().min(1) }),
  z.object({ type: z.literal('conversation.usage.updated'), usage: ConversationUsageSchema }),
])

/** Canonical plan or usage replacement for one conversation. */
export const ConversationProgressEventSchema = progressEventDataSchema

/** Canonical plan or usage replacement for one conversation. */
export type ConversationProgressEvent = z.infer<typeof ConversationProgressEventSchema>
