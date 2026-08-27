import { z } from 'zod'

import {
  ConversationIdSchema,
  IsoDateTimeSchema,
  type ConversationId,
  type IsoDateTime,
} from '../identity/identity.ts'

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

/** Assemble one conversation summary from already-typed fields. */
export function makeConversationSummary(input: {
  readonly id: ConversationId
  readonly cwd: string
  readonly gitRoot: string
  readonly title: string
  readonly updatedAt: IsoDateTime
}): ConversationSummary {
  return {
    id: input.id,
    cwd: input.cwd,
    gitRoot: input.gitRoot,
    title: input.title,
    updatedAt: input.updatedAt,
  }
}
