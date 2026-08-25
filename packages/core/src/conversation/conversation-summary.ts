import { z } from 'zod'

import { ConversationIdSchema, IsoDateTimeSchema } from '../identity/identity.ts'

/** Metadata for one conversation in the conversation list. */
export const ConversationSummarySchema = z.strictObject({
  id: ConversationIdSchema,
  cwd: z.string().min(1),
  gitRoot: z.string().min(1),
  title: z.string(),
  updatedAt: IsoDateTimeSchema,
})

/** Metadata for one conversation in the conversation list. */
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

export const ConversationSummariesSchema = z.array(ConversationSummarySchema)

/** Parse provider metadata into one conversation summary. */
export function makeConversationSummary(
  input: z.input<typeof ConversationSummarySchema>,
): ConversationSummary {
  return ConversationSummarySchema.parse(input)
}
