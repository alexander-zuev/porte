import { z } from 'zod'

import { ConversationIdSchema, IsoDateTimeSchema, TurnIdSchema } from '../identity/identity.ts'

/** One conversation shown in the conversation list. */
export const ConversationSchema = z.strictObject({
  id: ConversationIdSchema,
  cwd: z.string().min(1),
  gitRoot: z.string().min(1),
  title: z.string(),
  updatedAt: IsoDateTimeSchema,
})

/** One conversation shown in the conversation list. */
export type Conversation = z.infer<typeof ConversationSchema>

/** An opaque position in one stable conversation list revision. */
export const ConversationCursorSchema = z.string().min(1).max(2048).brand<'ConversationCursor'>()

/** An opaque position in one stable conversation list revision. */
export type ConversationCursor = z.infer<typeof ConversationCursorSchema>

/** The ordered revision of the complete Host conversation list. */
export const ConversationListRevisionSchema = z
  .number()
  .int()
  .nonnegative()
  .brand<'ConversationListRevision'>()

/** The ordered revision of the complete Host conversation list. */
export type ConversationListRevision = z.infer<typeof ConversationListRevisionSchema>

/** The maximum conversation count accepted by one list request. */
export const LIST_CONVERSATIONS_LIMIT_MAX = 100

/** Input for one bounded conversation list read. */
export const ListConversationsParamsSchema = z.strictObject({
  cursor: ConversationCursorSchema.optional(),
  limit: z.number().int().positive().max(LIST_CONVERSATIONS_LIMIT_MAX),
})

/** Input for one bounded conversation list read. */
export type ListConversationsParams = z.infer<typeof ListConversationsParamsSchema>

/** Conversations returned from one stable list revision. */
export const ListConversationsResultSchema = z.strictObject({
  conversations: z.array(ConversationSchema),
  next: ConversationCursorSchema.optional(),
  revision: ConversationListRevisionSchema,
})

/** Conversations returned from one stable list revision. */
export type ListConversationsResult = z.infer<typeof ListConversationsResultSchema>

/** Whether one conversation has an active turn. */
export const ConversationTurnStateSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('idle') }),
  z.strictObject({ state: z.literal('running'), turnId: TurnIdSchema }),
])

/** Whether one conversation has an active turn. */
export type ConversationTurnState = z.infer<typeof ConversationTurnStateSchema>

/** Parse already-mapped fields into one conversation. */
export function makeConversation(input: z.input<typeof ConversationSchema>): Conversation {
  return ConversationSchema.parse(input)
}
