import { z } from 'zod'

import { CanonicalContentSchema } from './canonical-content.ts'
import {
  SessionCommandSchema,
  SessionConfigurationOptionSchema,
} from './coding-session-controls-event.ts'
import { PendingElicitationSchema } from './coding-session-elicitation-event.ts'
import { PendingPermissionSchema } from './coding-session-permission-event.ts'
import { PlanEntrySchema, SessionUsageSchema } from './coding-session-progress-event.ts'
import { ToolViewSchema } from './coding-session-tool-event.ts'
import { MessageIdSchema, ToolCallIdSchema } from './identity.ts'

/** Complete rendered user or assistant message in a session snapshot. */
export const MessageViewSchema = z.object({
  type: z.literal('message'),
  messageId: MessageIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.array(CanonicalContentSchema),
})

/** Complete rendered user or assistant message in a session snapshot. */
export type MessageView = z.infer<typeof MessageViewSchema>

/** Complete reasoning item in a session snapshot. */
export const ReasoningViewSchema = z.object({
  type: z.literal('reasoning'),
  messageId: MessageIdSchema,
  content: z.array(CanonicalContentSchema),
})

/** Complete reasoning item in a session snapshot. */
export type ReasoningView = z.infer<typeof ReasoningViewSchema>

/** One ordered conversation item in a session snapshot. */
export const ConversationItemSchema = z.discriminatedUnion('type', [
  MessageViewSchema,
  ReasoningViewSchema,
  z.object({ type: z.literal('tool'), toolCallId: ToolCallIdSchema }),
])

/** One ordered conversation item in a session snapshot. */
export type ConversationItem = z.infer<typeof ConversationItemSchema>

/** Pending user interactions for one active session. */
export const PendingInteractionsSchema = z.object({
  permissions: z.array(PendingPermissionSchema),
  elicitations: z.array(PendingElicitationSchema),
})

/** Pending user interactions for one active session. */
export type PendingInteractions = z.infer<typeof PendingInteractionsSchema>

/** Complete current view of one open coding session. */
export const SessionViewSchema = z.object({
  items: z.array(ConversationItemSchema),
  tools: z.array(ToolViewSchema),
  plan: z.array(PlanEntrySchema),
  usage: SessionUsageSchema.optional(),
  configuration: z.array(SessionConfigurationOptionSchema).optional(),
  commands: z.array(SessionCommandSchema).optional(),
  pending: PendingInteractionsSchema,
})

/** Complete current view of one open coding session. */
export type SessionView = z.infer<typeof SessionViewSchema>
