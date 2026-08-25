import { z } from 'zod'

import { ConversationSummarySchema } from './conversation-summary.ts'

/** An opaque position in one stable conversation list revision. */
export const ConversationCursorSchema = z.string().min(1).max(2048).brand<'ConversationCursor'>()

/** An opaque position in one stable conversation list revision. */
export type ConversationCursor = z.infer<typeof ConversationCursorSchema>

/** The maximum conversation count accepted by one list request. */
export const LIST_CONVERSATIONS_LIMIT_MAX = 100
export const LIST_CONVERSATIONS_LIMIT_DEFAULT = 50

/** Input for one bounded conversation list read. */
export const ListConversationsParamsSchema = z.strictObject({
  cursor: ConversationCursorSchema.optional(),
  limit: z.number().int().positive().max(LIST_CONVERSATIONS_LIMIT_MAX),
})

/** Input for one bounded conversation list read. */
export type ListConversationsParams = z.infer<typeof ListConversationsParamsSchema>

/** Conversation summaries returned from one stable Host list read. */
export const ListConversationsResultSchema = z.strictObject({
  conversations: z.array(ConversationSummarySchema),
  next: ConversationCursorSchema.optional(),
})

/** Conversation summaries returned from one stable Host list read. */
export type ListConversationsResult = z.infer<typeof ListConversationsResultSchema>
