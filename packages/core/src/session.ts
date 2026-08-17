import { z } from 'zod'

import { IsoDateTimeSchema, SessionIdSchema, TurnIdSchema } from './identity.ts'

/**
 * One local coding-agent session that the host can list or resume.
 * The Worker treats the host path as an opaque string.
 */
export const SessionSummarySchema = z.object({
  id: SessionIdSchema,
  cwd: z.string().min(1),
  title: z.string(),
  updatedAt: IsoDateTimeSchema,
})
export type SessionSummary = z.infer<typeof SessionSummarySchema>

export const SyncedSessionCatalogSchema = z.object({
  state: z.literal('synced'),
  sessions: z.array(SessionSummarySchema),
  observedAt: IsoDateTimeSchema,
})

export const SessionCatalogSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('never-synced') }),
  SyncedSessionCatalogSchema,
])
export type SessionCatalog = z.infer<typeof SessionCatalogSchema>

export const HostSnapshotSchema = z.object({
  status: z.enum(['online', 'offline']),
  catalog: SessionCatalogSchema,
})
export type HostSnapshot = z.infer<typeof HostSnapshotSchema>

export const SessionTurnStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({ state: z.literal('running'), turnId: TurnIdSchema }),
])
export type SessionTurnState = z.infer<typeof SessionTurnStateSchema>

/**
 * Build a session row from already-mapped fields.
 *
 * @param input - Session id, working directory, title, and update time.
 */
export function makeSessionSummary(input: z.input<typeof SessionSummarySchema>): SessionSummary {
  return SessionSummarySchema.parse(input)
}
