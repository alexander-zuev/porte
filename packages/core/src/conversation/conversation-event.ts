import { z } from 'zod'

import { EventIdSchema, ConversationIdSchema } from '../identity/identity.ts'
import { ConversationControlsEventSchema } from './conversation-controls-event.ts'
import { ConversationElicitationEventSchema } from './conversation-elicitation-event.ts'
import { ConversationLifecycleEventSchema } from './conversation-lifecycle-event.ts'
import { ConversationMessageEventSchema } from './conversation-message-event.ts'
import { ConversationPermissionEventSchema } from './conversation-permission-event.ts'
import { ConversationProgressEventSchema } from './conversation-progress-event.ts'
import { ConversationToolEventSchema } from './conversation-tool-event.ts'
import { ConversationViewSchema } from './conversation-view.ts'

/** Canonical full-state snapshot for one open conversation. */
export const ConversationSnapshotEventSchema = z.object({
  eventId: EventIdSchema,
  conversationId: ConversationIdSchema,
  type: z.literal('conversation.snapshot'),
  view: ConversationViewSchema,
})

/** Canonical full-state snapshot for one open conversation. */
export type ConversationSnapshotEvent = z.infer<typeof ConversationSnapshotEventSchema>

/** Complete provider-independent event union for one conversation. */
export const ConversationEventSchema = z.union([
  ConversationSnapshotEventSchema,
  ConversationMessageEventSchema,
  ConversationToolEventSchema,
  ConversationProgressEventSchema,
  ConversationControlsEventSchema,
  ConversationLifecycleEventSchema,
  ConversationPermissionEventSchema,
  ConversationElicitationEventSchema,
])

/** Complete provider-independent event union for one conversation. */
export type ConversationEvent = z.infer<typeof ConversationEventSchema>

export * from './canonical-content.ts'
export * from './coding-agent-error.ts'
export * from './conversation-controls-event.ts'
export * from './conversation-message-event.ts'
export * from './conversation-elicitation-event.ts'
export * from './conversation-lifecycle-event.ts'
export * from './conversation-permission-event.ts'
export * from './conversation-progress-event.ts'
export * from './conversation-tool-event.ts'
export * from './conversation-view.ts'
