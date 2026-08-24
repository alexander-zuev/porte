import { z } from 'zod'

import { ConversationIdSchema } from '../identity/identity.ts'
import { ConversationEventSchema } from './conversation-event.ts'
import { ConversationStateSnapshotSchema } from './conversation-view.ts'
import { ConversationIdentitySchema } from './conversation.ts'

// TEMPORARY: Keep the old transcript contract until the Host JSON-RPC refactor resumes.
export const TranscriptCursorSchema = z
  .string()
  .regex(/^\d+$/, { error: 'Transcript cursor must be a whole number' })
  .brand<'TranscriptCursor'>()
export type TranscriptCursor = z.infer<typeof TranscriptCursorSchema>

export const ReadConversationSchema = z.object({
  conversationId: ConversationIdSchema,
  cursor: TranscriptCursorSchema.nullable(),
  limit: z.number().int().min(1).max(500),
})
export type ReadConversation = z.infer<typeof ReadConversationSchema>

export const ConversationTranscriptSchema = z.object({
  conversation: ConversationIdentitySchema,
  events: z.array(ConversationEventSchema),
  next: TranscriptCursorSchema.nullable(),
  state: ConversationStateSnapshotSchema,
})
export type ConversationTranscript = z.infer<typeof ConversationTranscriptSchema>
