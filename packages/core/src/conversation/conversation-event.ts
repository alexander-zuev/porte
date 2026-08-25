import { z } from 'zod'

import { ConversationIdSchema } from '../identity/identity.ts'
import { ConversationControlsEventSchema } from './conversation-controls-event.ts'
import { ConversationElicitationEventSchema } from './conversation-elicitation-event.ts'
import { ConversationLifecycleEventSchema } from './conversation-lifecycle-event.ts'
import { ConversationMessageEventSchema } from './conversation-message-event.ts'
import { ConversationPermissionEventSchema } from './conversation-permission-event.ts'
import { ConversationProgressEventSchema } from './conversation-progress-event.ts'
import { ConversationToolEventSchema } from './conversation-tool-event.ts'

/** Complete provider-independent event union for one conversation. */
export const ConversationEventSchema = z.union([
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

/** One event emitted by an open coding-agent conversation. */
export const ConversationEmissionSchema = z.object({
  conversationId: ConversationIdSchema,
  event: ConversationEventSchema,
})

/** One event emitted by an open coding-agent conversation. */
export type ConversationEmission = z.infer<typeof ConversationEmissionSchema>

export * from './canonical-content.ts'
export * from './conversation-controls-event.ts'
export * from './conversation-message-event.ts'
export * from './conversation-elicitation-event.ts'
export * from './conversation-lifecycle-event.ts'
export * from './conversation-permission-event.ts'
export * from './conversation-progress-event.ts'
export * from './conversation-tool-event.ts'
export * from './conversation-view.ts'
