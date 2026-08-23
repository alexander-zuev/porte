import { z } from 'zod'

import { ConversationIdSchema } from '../identity/identity.ts'
import { ConversationEventSchema } from './conversation-event.ts'
import { ConversationStateSnapshotSchema } from './conversation-view.ts'
import { ConversationIdentitySchema } from './conversation.ts'

export const TranscriptCursorSchema = z
  .string()
  .regex(/^\d+$/, { error: 'Transcript cursor must be a whole number' })
  .brand<'TranscriptCursor'>()
export type TranscriptCursor = z.infer<typeof TranscriptCursorSchema>

/** One request for a stored transcript page. */
export const ReadConversationSchema = z.object({
  conversationId: ConversationIdSchema,
  cursor: TranscriptCursorSchema.nullable(),
  limit: z.number().int().min(1).max(500),
})
export type ReadConversation = z.infer<typeof ReadConversationSchema>

/** One page of a stored transcript, newest turn last. */
export const ConversationTranscriptSchema = z.object({
  conversation: ConversationIdentitySchema,
  events: z.array(ConversationEventSchema),
  next: TranscriptCursorSchema.nullable(),
  state: ConversationStateSnapshotSchema,
})
export type ConversationTranscript = z.infer<typeof ConversationTranscriptSchema>
