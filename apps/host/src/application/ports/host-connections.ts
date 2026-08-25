import type { ConversationId } from '@porte/core/client'

/** Owns the Host WebSocket resources. */
export interface HostConnections {
  readonly controlStopped: Promise<void>
  connectControl(): void
  connectConversation(conversationId: ConversationId): void
  closeConversation(conversationId: ConversationId): Promise<void>
  closeAll(): Promise<void>
}
