import { z } from 'zod'

import { CanonicalContentSchema } from './canonical-content.ts'
import { CodingAgentErrorSchema } from './coding-agent-error.ts'
import { EventIdSchema, MessageIdSchema, ConversationIdSchema, TurnIdSchema } from './identity.ts'

const turnOutcomeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('completed'),
    reason: z.enum(['completed', 'limit_reached', 'refused', 'other']),
  }),
  z.object({ type: z.literal('cancelled') }),
  z.object({ type: z.literal('failed'), error: CodingAgentErrorSchema }),
])

const conversationEventDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn.started'), turnId: TurnIdSchema }),
  z.object({ type: z.literal('turn.finished'), turnId: TurnIdSchema, outcome: turnOutcomeSchema }),
  z.object({
    type: z.literal('message.started'),
    turnId: TurnIdSchema,
    messageId: MessageIdSchema,
    role: z.enum(['user', 'assistant']),
  }),
  z.object({
    type: z.literal('message.delta'),
    turnId: TurnIdSchema,
    messageId: MessageIdSchema,
    content: CanonicalContentSchema,
  }),
  z.object({
    type: z.literal('message.completed'),
    turnId: TurnIdSchema,
    messageId: MessageIdSchema,
  }),
  z.object({
    type: z.literal('reasoning.started'),
    turnId: TurnIdSchema,
    messageId: MessageIdSchema,
  }),
  z.object({
    type: z.literal('reasoning.delta'),
    turnId: TurnIdSchema,
    messageId: MessageIdSchema,
    content: CanonicalContentSchema,
  }),
  z.object({
    type: z.literal('reasoning.completed'),
    turnId: TurnIdSchema,
    messageId: MessageIdSchema,
  }),
])

/** Canonical turn, message, or reasoning event for one conversation. */
export const ConversationMessageEventSchema = z.intersection(
  z.object({ eventId: EventIdSchema, conversationId: ConversationIdSchema }),
  conversationEventDataSchema,
)

/** Canonical turn, message, or reasoning event for one conversation. */
export type ConversationMessageEvent = z.infer<typeof ConversationMessageEventSchema>
