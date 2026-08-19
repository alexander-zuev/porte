import { z } from 'zod'

import { CodingAgentErrorSchema } from './coding-agent-error.ts'
import { EventIdSchema, IsoDateTimeSchema, SessionIdSchema } from './identity.ts'

/** Non-empty metadata change with explicit clear values. */
export const SessionMetadataPatchSchema = z
  .object({
    title: z.string().nullable().optional(),
    updatedAt: IsoDateTimeSchema.nullable().optional(),
  })
  .refine((update) => update.title !== undefined || update.updatedAt !== undefined, {
    error: 'Metadata update must contain one field',
  })

/** Non-empty metadata change with explicit clear values. */
export type SessionMetadataPatch = z.infer<typeof SessionMetadataPatchSchema>

const lifecycleEventDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.metadata.updated'), update: SessionMetadataPatchSchema }),
  z.object({ type: z.literal('session.failed'), error: CodingAgentErrorSchema }),
])

/** Canonical metadata change or terminal failure for one coding session. */
export const CodingSessionLifecycleEventSchema = z.intersection(
  z.object({ eventId: EventIdSchema, sessionId: SessionIdSchema }),
  lifecycleEventDataSchema,
)

/** Canonical metadata change or terminal failure for one coding session. */
export type CodingSessionLifecycleEvent = z.infer<typeof CodingSessionLifecycleEventSchema>
