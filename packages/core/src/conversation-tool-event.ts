import { z } from 'zod'

import { CanonicalContentSchema } from './canonical-content.ts'
import { EventIdSchema, ConversationIdSchema, ToolCallIdSchema, TurnIdSchema } from './identity.ts'

/** Provider-independent category used to present one tool call. */
export const ToolKindSchema = z.enum([
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
  'other',
])

/** Provider-independent category used to present one tool call. */
export type ToolKind = z.infer<typeof ToolKindSchema>

/** Current lifecycle state of one tool call. */
export const ToolStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed'])

/** Current lifecycle state of one tool call. */
export type ToolStatus = z.infer<typeof ToolStatusSchema>

/** Display content or file diff produced by one tool call. */
export const ToolContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content'), content: CanonicalContentSchema }),
  z.object({ type: z.literal('terminal'), terminalId: z.string().min(1) }),
  z.object({
    type: z.literal('diff'),
    path: z.string().min(1),
    oldText: z.string().nullable(),
    newText: z.string(),
  }),
])

/** Display content or file diff produced by one tool call. */
export type ToolContent = z.infer<typeof ToolContentSchema>

/** Source location associated with one tool call. */
export const ToolLocationSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive().optional(),
})

/** Source location associated with one tool call. */
export type ToolLocation = z.infer<typeof ToolLocationSchema>

/** Complete current view of one tool call. */
export const ToolViewSchema = z.object({
  toolCallId: ToolCallIdSchema,
  title: z.string(),
  kind: ToolKindSchema,
  status: ToolStatusSchema,
  content: z.array(ToolContentSchema),
  locations: z.array(ToolLocationSchema),
})

/** Complete current view of one tool call. */
export type ToolView = z.infer<typeof ToolViewSchema>

/** Canonical full-state update for one coding-agent tool call. */
export const ConversationToolEventSchema = z.object({
  eventId: EventIdSchema,
  conversationId: ConversationIdSchema,
  type: z.literal('tool.updated'),
  turnId: TurnIdSchema,
  tool: ToolViewSchema,
})

/** Canonical full-state update for one coding-agent tool call. */
export type ConversationToolEvent = z.infer<typeof ConversationToolEventSchema>
