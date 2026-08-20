import { z } from 'zod'

import { IsoDateTimeSchema, ConversationIdSchema, TurnIdSchema } from './identity.ts'

/**
 * One local coding-agent conversation that the host can list or resume.
 * The Worker treats the host path as an opaque string.
 */
export const ConversationSummarySchema = z.object({
  id: ConversationIdSchema,
  cwd: z.string().min(1),
  title: z.string(),
  updatedAt: IsoDateTimeSchema,
})
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

export const SyncedConversationCatalogSchema = z.object({
  state: z.literal('synced'),
  conversations: z.array(ConversationSummarySchema),
  observedAt: IsoDateTimeSchema,
})

export const ConversationCatalogSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('never-synced') }),
  SyncedConversationCatalogSchema,
])
export type ConversationCatalog = z.infer<typeof ConversationCatalogSchema>

export const HostSnapshotSchema = z.object({
  status: z.enum(['online', 'offline']),
  catalog: ConversationCatalogSchema,
})
export type HostSnapshot = z.infer<typeof HostSnapshotSchema>

export const ConversationTurnStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({ state: z.literal('running'), turnId: TurnIdSchema }),
])
export type ConversationTurnState = z.infer<typeof ConversationTurnStateSchema>

/**
 * Build a conversation row from already-mapped fields.
 *
 * @param input - Conversation id, working directory, title, and update time.
 */
export function makeConversationSummary(
  input: z.input<typeof ConversationSummarySchema>,
): ConversationSummary {
  return ConversationSummarySchema.parse(input)
}
