import { z } from 'zod'

import { CanonicalContentSchema } from './canonical-content.ts'
import {
  ConversationCommandSchema,
  ConversationConfigurationOptionSchema,
} from './conversation-controls-event.ts'
import { PendingElicitationSchema } from './conversation-elicitation-event.ts'
import { PendingPermissionSchema } from './conversation-permission-event.ts'
import { PlanEntrySchema, ConversationUsageSchema } from './conversation-progress-event.ts'
import { ToolViewSchema } from './conversation-tool-event.ts'
import { MessageIdSchema, ToolCallIdSchema } from './identity.ts'

/** Complete rendered user or assistant message in a conversation snapshot. */
export const MessageViewSchema = z.object({
  type: z.literal('message'),
  messageId: MessageIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.array(CanonicalContentSchema),
})

/** Complete rendered user or assistant message in a conversation snapshot. */
export type MessageView = z.infer<typeof MessageViewSchema>

/** Complete reasoning item in a conversation snapshot. */
export const ReasoningViewSchema = z.object({
  type: z.literal('reasoning'),
  messageId: MessageIdSchema,
  content: z.array(CanonicalContentSchema),
})

/** Complete reasoning item in a conversation snapshot. */
export type ReasoningView = z.infer<typeof ReasoningViewSchema>

/** One ordered conversation item in a conversation snapshot. */
export const ConversationItemSchema = z.discriminatedUnion('type', [
  MessageViewSchema,
  ReasoningViewSchema,
  z.object({ type: z.literal('tool'), toolCallId: ToolCallIdSchema }),
])

/** One ordered conversation item in a conversation snapshot. */
export type ConversationItem = z.infer<typeof ConversationItemSchema>

/** Pending user interactions for one active conversation. */
export const PendingInteractionsSchema = z.object({
  permissions: z.array(PendingPermissionSchema),
  elicitations: z.array(PendingElicitationSchema),
})

/** Pending user interactions for one active conversation. */
export type PendingInteractions = z.infer<typeof PendingInteractionsSchema>

/** Complete current view of one open conversation. */
export const ConversationViewSchema = z.object({
  items: z.array(ConversationItemSchema),
  tools: z.array(ToolViewSchema),
  plan: z.array(PlanEntrySchema),
  usage: ConversationUsageSchema.optional(),
  configuration: z.array(ConversationConfigurationOptionSchema).optional(),
  commands: z.array(ConversationCommandSchema).optional(),
  modeId: z.string().min(1).optional(),
  pending: PendingInteractionsSchema,
})

/** Complete current view of one open conversation. */
export type ConversationView = z.infer<typeof ConversationViewSchema>
