import { z } from 'zod'

import { MessageIdSchema, ToolCallIdSchema } from '../identity/identity.ts'
import { CanonicalContentSchema } from './canonical-content.ts'
import {
  ConversationCommandSchema,
  ConversationConfigurationOptionSchema,
} from './conversation-controls-event.ts'
import { PendingElicitationSchema } from './conversation-elicitation-event.ts'
import { PendingPermissionSchema } from './conversation-permission-event.ts'
import { ConversationPlanSchema, ConversationUsageSchema } from './conversation-progress-event.ts'
import { ToolViewSchema } from './conversation-tool-event.ts'
import { ConversationTurnStateSchema } from './conversation.ts'

/** Complete rendered user or assistant message in a conversation. */
export const MessageViewSchema = z.object({
  type: z.literal('message'),
  messageId: MessageIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.array(CanonicalContentSchema),
})

/** Complete rendered user or assistant message in a conversation. */
export type MessageView = z.infer<typeof MessageViewSchema>

/** Complete reasoning item in a conversation. */
export const ReasoningViewSchema = z.object({
  type: z.literal('reasoning'),
  messageId: MessageIdSchema,
  content: z.array(CanonicalContentSchema),
})

/** Complete reasoning item in a conversation. */
export type ReasoningView = z.infer<typeof ReasoningViewSchema>

/** One ordered item in a conversation. */
export const ConversationItemSchema = z.discriminatedUnion('type', [
  MessageViewSchema,
  ReasoningViewSchema,
  z.object({ type: z.literal('tool'), toolCallId: ToolCallIdSchema }),
])

/** One ordered item in a conversation. */
export type ConversationItem = z.infer<typeof ConversationItemSchema>

/** Pending user interactions for one active conversation. */
export const PendingInteractionsSchema = z.object({
  permissions: z.array(PendingPermissionSchema),
  elicitations: z.array(PendingElicitationSchema),
})

/** Pending user interactions for one active conversation. */
export type PendingInteractions = z.infer<typeof PendingInteractionsSchema>

const conversationViewFields = {
  items: z.array(ConversationItemSchema),
  tools: z.array(ToolViewSchema),
  plans: z.array(ConversationPlanSchema),
  usage: ConversationUsageSchema.optional(),
  configuration: z.array(ConversationConfigurationOptionSchema).optional(),
  commands: z.array(ConversationCommandSchema).optional(),
  modeId: z.string().min(1).optional(),
  pending: PendingInteractionsSchema,
}

/** Complete current view of one open conversation. */
export const ConversationViewSchema = z.strictObject(conversationViewFields)

/** Complete current view of one open conversation. */
export type ConversationView = z.infer<typeof ConversationViewSchema>

/** Complete mutable state at one live conversation position. */
export const ConversationStateSchema = z.strictObject({
  turn: ConversationTurnStateSchema,
  ...conversationViewFields,
})

/** Complete mutable state at one live conversation position. */
export type ConversationState = z.infer<typeof ConversationStateSchema>

/** Select mutable state from one complete provider view. */
export function makeConversationState(
  view: ConversationView,
  turn: z.infer<typeof ConversationTurnStateSchema>,
): ConversationState {
  return ConversationStateSchema.parse({
    turn,
    ...view,
  })
}
