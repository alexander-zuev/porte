import type { ConversationId, ConversationMetadataPatch } from '@porte/core/client'

/** Notifications that the Host sends through the control connection. */
export interface ControlNotifications {
  /** Report new conversation metadata. */
  conversationUpdated(conversationId: ConversationId, update: ConversationMetadataPatch): void
}
