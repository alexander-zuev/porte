import type { ConversationCursor, ConversationId } from '@porte/core/client'

/** Payload of every host query by name. One handler per entry, read-only. */
export type QueryDataMap = {
  ListConversations: { cursor?: ConversationCursor }
  GetConversation: { conversationId: ConversationId }
}
