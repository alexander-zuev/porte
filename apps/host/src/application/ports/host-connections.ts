import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import type { ConversationId } from '@porte/core/client'

/** The relay sockets: one control connection, one connection per attached conversation. */
export interface HostConnections {
  readonly controlStopped: Promise<void>
  readonly control: ControlNotifications
  connectControl(): void
  /** Idempotent. `cwd` is what `session/load` needs; the relay stores it per conversation. */
  connectConversation(conversationId: ConversationId, cwd: string): void
  /** Null while the conversation has no socket; events for it are then not sent. */
  conversation(conversationId: ConversationId): ConversationNotifications | null
  closeConversation(conversationId: ConversationId): void
  closeAll(): void
}
