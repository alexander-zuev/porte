import type {
  ChangedFilePath,
  ConversationCursor,
  ConversationId,
  TurnId,
} from '@porte/core/client'

/** Payload of every host query by name. One handler per entry, read-only. */
export type QueryDataMap = {
  ListConversations: { cursor?: ConversationCursor }
  GetConversation: { conversationId: ConversationId }
  /** One turn's slice of the transcript, what the relay reconciles after `turn.finished`. */
  GetTurn: { conversationId: ConversationId; turnId: TurnId }
  /** The conversation's working tree against `HEAD`: every changed file with its counts. */
  ListWorkspaceChanges: { conversationId: ConversationId }
  /** One changed file's unified diff. */
  GetWorkspaceChange: { conversationId: ConversationId; path: ChangedFilePath }
}
