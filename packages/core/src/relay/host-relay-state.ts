import { z } from 'zod'

import { ConversationIdSchema, TurnIdSchema } from '../identity/identity.ts'

/** Minimal list state for one conversation that owns an active turn. */
export const RelayActiveConversationSchema = z.object({
  conversationId: ConversationIdSchema,
  turnId: TurnIdSchema,
  hasAssistantMessage: z.boolean(),
})

/** Minimal list state for one conversation that owns an active turn. */
export type RelayActiveConversation = z.infer<typeof RelayActiveConversationSchema>

/** Reactive parent Agent state sent to web clients. */
export const HostRelayStateSchema = z.object({
  hostStatus: z.enum(['online', 'offline']),
  activeConversations: z.array(RelayActiveConversationSchema),
})

/** Reactive parent Agent state sent to web clients. */
export type HostRelayState = z.infer<typeof HostRelayStateSchema>
