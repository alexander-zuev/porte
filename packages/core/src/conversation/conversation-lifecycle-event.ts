import { z } from 'zod'

import { IsoDateTimeSchema } from '../identity/identity.ts'
import { CodingAgentErrorSchema } from './coding-agent-error.ts'

/** Non-empty metadata change with explicit clear values. */
export const ConversationMetadataPatchSchema = z
  .object({
    title: z.string().nullable().optional(),
    updatedAt: IsoDateTimeSchema.nullable().optional(),
  })
  .refine((update) => update.title !== undefined || update.updatedAt !== undefined, {
    error: 'Metadata update must contain one field',
  })

/** Non-empty metadata change with explicit clear values. */
export type ConversationMetadataPatch = z.infer<typeof ConversationMetadataPatchSchema>

const lifecycleEventDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('conversation.metadata.updated'),
    update: ConversationMetadataPatchSchema,
  }),
  z.object({ type: z.literal('conversation.failed'), error: CodingAgentErrorSchema }),
])

/** Canonical metadata change or terminal failure for one conversation. */
export const ConversationLifecycleEventSchema = lifecycleEventDataSchema

/** Canonical metadata change or terminal failure for one conversation. */
export type ConversationLifecycleEvent = z.infer<typeof ConversationLifecycleEventSchema>
