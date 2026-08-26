import type { ConversationEvent } from '@porte/core/client'

/** Notifications that the Host sends through one conversation connection. */
export interface ConversationNotifications {
  /** Send one canonical conversation event. */
  sendEvent(event: ConversationEvent): void
}
