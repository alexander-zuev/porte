import { z } from 'zod'

import { CodingSessionControlsEventSchema } from './coding-session-controls-event.ts'
import { CodingSessionConversationEventSchema } from './coding-session-conversation-event.ts'
import { CodingSessionElicitationEventSchema } from './coding-session-elicitation-event.ts'
import { CodingSessionLifecycleEventSchema } from './coding-session-lifecycle-event.ts'
import { CodingSessionPermissionEventSchema } from './coding-session-permission-event.ts'
import { CodingSessionProgressEventSchema } from './coding-session-progress-event.ts'
import { CodingSessionToolEventSchema } from './coding-session-tool-event.ts'
import { EventIdSchema, SessionIdSchema } from './identity.ts'
import { SessionViewSchema } from './session-view.ts'

/** Canonical full-state snapshot for one open coding session. */
export const CodingSessionSnapshotEventSchema = z.object({
  eventId: EventIdSchema,
  sessionId: SessionIdSchema,
  type: z.literal('session.snapshot'),
  view: SessionViewSchema,
})

/** Canonical full-state snapshot for one open coding session. */
export type CodingSessionSnapshotEvent = z.infer<typeof CodingSessionSnapshotEventSchema>

/** Complete provider-independent event union for one coding session. */
export const CodingSessionEventSchema = z.union([
  CodingSessionSnapshotEventSchema,
  CodingSessionConversationEventSchema,
  CodingSessionToolEventSchema,
  CodingSessionProgressEventSchema,
  CodingSessionControlsEventSchema,
  CodingSessionLifecycleEventSchema,
  CodingSessionPermissionEventSchema,
  CodingSessionElicitationEventSchema,
])

/** Complete provider-independent event union for one coding session. */
export type CodingSessionEvent = z.infer<typeof CodingSessionEventSchema>

export * from './canonical-content.ts'
export * from './coding-agent-error.ts'
export * from './coding-session-controls-event.ts'
export * from './coding-session-conversation-event.ts'
export * from './coding-session-elicitation-event.ts'
export * from './coding-session-lifecycle-event.ts'
export * from './coding-session-permission-event.ts'
export * from './coding-session-progress-event.ts'
export * from './coding-session-tool-event.ts'
export * from './session-view.ts'
