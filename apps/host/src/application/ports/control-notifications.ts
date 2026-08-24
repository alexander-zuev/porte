import type { Conversation, ConversationId } from '@porte/core/client'

/** Notifications that the Host sends through the control connection. */
export interface ControlNotifications {
  /** Report new conversation metadata. */
  conversationUpdated(conversation: Conversation): void

  /** Report that one conversation no longer exists. */
  conversationRemoved(conversationId: ConversationId): void
}
