import { z } from 'zod'

import { ConversationIdSchema } from '../identity/identity.ts'
import { ConversationEventSchema } from './conversation-event.ts'

/** An opaque position in the stored events for one conversation. */
export const ConversationEventCursorSchema = z
  .string()
  .min(1)
  .max(2048)
  .brand<'ConversationEventCursor'>()

/** An opaque position in the stored events for one conversation. */
export type ConversationEventCursor = z.infer<typeof ConversationEventCursorSchema>

/** The maximum event count accepted by one conversation read. */
export const READ_CONVERSATION_LIMIT_MAX = 500

/** Input for one bounded read of stored conversation events. */
export const ReadConversationParamsSchema = z.strictObject({
  conversationId: ConversationIdSchema,
  cursor: ConversationEventCursorSchema.optional(),
  limit: z.number().int().positive().max(READ_CONVERSATION_LIMIT_MAX),
})

/** Input for one bounded read of stored conversation events. */
export type ReadConversationParams = z.infer<typeof ReadConversationParamsSchema>

/** Stored canonical events returned for one conversation. */
export const ReadConversationResultSchema = z.strictObject({
  events: z.array(ConversationEventSchema),
  next: ConversationEventCursorSchema.optional(),
})

/** Stored canonical events returned for one conversation. */
export type ReadConversationResult = z.infer<typeof ReadConversationResultSchema>
