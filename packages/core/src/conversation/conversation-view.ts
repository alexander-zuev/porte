import { z } from 'zod'

import { MessageIdSchema, ToolCallIdSchema, TurnIdSchema } from '../identity/identity.ts'
import { CanonicalContentSchema } from './canonical-content.ts'
import {
  ConversationCommandSchema,
  ConversationConfigurationOptionSchema,
} from './conversation-controls-event.ts'
import { PendingElicitationSchema } from './conversation-elicitation-event.ts'
import { PendingPermissionSchema } from './conversation-permission-event.ts'
import { ConversationPlanSchema, ConversationUsageSchema } from './conversation-progress-event.ts'
import { ToolViewSchema } from './conversation-tool-event.ts'

/** Whether one conversation has an active turn. */
export const ConversationTurnStateSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('idle') }),
  z.strictObject({ state: z.literal('running'), turnId: TurnIdSchema }),
])

/** Whether one conversation has an active turn. */
export type ConversationTurnState = z.infer<typeof ConversationTurnStateSchema>

/** Complete rendered user or assistant message in a conversation. */
export const MessageViewSchema = z.object({
  type: z.literal('message'),
  turnId: TurnIdSchema,
  messageId: MessageIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.array(CanonicalContentSchema),
})

/** Complete rendered user or assistant message in a conversation. */
export type MessageView = z.infer<typeof MessageViewSchema>

/** Complete reasoning item in a conversation. */
export const ReasoningViewSchema = z.object({
  type: z.literal('reasoning'),
  turnId: TurnIdSchema,
  messageId: MessageIdSchema,
  content: z.array(CanonicalContentSchema),
})

/** Complete reasoning item in a conversation. */
export type ReasoningView = z.infer<typeof ReasoningViewSchema>

/** One ordered item in a conversation. Every item knows its turn, so a snapshot can group by it. */
export const ConversationItemSchema = z.discriminatedUnion('type', [
  MessageViewSchema,
  ReasoningViewSchema,
  z.object({ type: z.literal('tool'), turnId: TurnIdSchema, toolCallId: ToolCallIdSchema }),
])

/** One ordered item in a conversation. */
export type ConversationItem = z.infer<typeof ConversationItemSchema>

/** One turn's slice of the transcript: what `turn.get` returns and the relay reconciles. */
export const ConversationTurnSchema = z.strictObject({
  turnId: TurnIdSchema,
  items: z.array(ConversationItemSchema),
  tools: z.array(ToolViewSchema),
})

/** One turn's slice of the transcript. */
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>

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
