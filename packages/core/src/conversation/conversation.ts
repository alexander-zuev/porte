import { z } from 'zod'

import { IsoDateTimeSchema, ConversationIdSchema, TurnIdSchema } from '../identity/identity.ts'

/**
 * One local coding-agent conversation, as any answer about it names it.
 * The Worker treats the host path as an opaque string.
 */
export const ConversationIdentitySchema = z.object({
  id: ConversationIdSchema,
  cwd: z.string().min(1),
  title: z.string(),
  updatedAt: IsoDateTimeSchema,
})
export type ConversationIdentity = z.infer<typeof ConversationIdentitySchema>

/**
 * One conversation as the list shows it: identity, plus what it groups under.
 *
 * `gitRoot` is required rather than optional because the host reports only
 * conversations that belong to a repository. Opening or reading one answers
 * with an identity instead: those calls read stored files, and a repository is
 * not something a stored file records.
 */
export const ConversationSummarySchema = ConversationIdentitySchema.extend({
  /** Repository the conversation was started in, as the agent recorded it then. */
  gitRoot: z.string().min(1),
})
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

export const ConversationsSchema = z.array(ConversationSummarySchema)

/** How many summaries one page carries when the caller does not say. */
export const CONVERSATION_PAGE_SIZE = 50
export const CONVERSATION_PAGE_LIMIT = 100

/**
 * How many stored events one transcript page carries.
 *
 * Counted in events rather than messages, because that is what the wire moves:
 * one exchange is roughly a dozen, so this is the last few turns of a
 * conversation rather than all of one that ran for hours.
 */
export const CONVERSATION_HISTORY_PAGE_SIZE = 200

/**
 * One page of summaries, newest first.
 *
 * `next` is null when the page came back short of the limit, which is the only
 * honest way to say "no more" without counting a collection that has no bound.
 */
export const ConversationPageSchema = z.object({
  conversations: ConversationsSchema,
  next: z.string().min(1).nullable(),
})
export type ConversationPage = z.infer<typeof ConversationPageSchema>

/** What a caller may ask for. Cursor, not offset: the collection is unbounded. */
export const ConversationPageQuerySchema = z.object({
  cursor: z.string().min(1).nullish(),
  limit: z.number().int().positive().max(CONVERSATION_PAGE_LIMIT).default(CONVERSATION_PAGE_SIZE),
})
export type ConversationPageQuery = z.infer<typeof ConversationPageQuerySchema>

export const ConversationTurnStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({ state: z.literal('running'), turnId: TurnIdSchema }),
])
export type ConversationTurnState = z.infer<typeof ConversationTurnStateSchema>

/**
 * Build a conversation row from already-mapped fields.
 *
 * @param input - Conversation id, working directory, repository root, title, and update time.
 */
export function makeConversationSummary(
  input: z.input<typeof ConversationSummarySchema>,
): ConversationSummary {
  return ConversationSummarySchema.parse(input)
}

/**
 * Build the identity of one conversation from already-mapped fields.
 *
 * @param input - Conversation id, working directory, title, and update time.
 */
export function makeConversationIdentity(
  input: z.input<typeof ConversationIdentitySchema>,
): ConversationIdentity {
  return ConversationIdentitySchema.parse(input)
}
