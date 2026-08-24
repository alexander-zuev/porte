import type { ConversationEvent, ConversationState } from '@porte/core/client'

/** Notifications that the Host sends through one conversation connection. */
export interface ConversationNotifications {
  /** Send the current conversation state after attachment. */
  sendState(state: ConversationState): void

  /** Send one canonical conversation event. */
  sendEvent(event: ConversationEvent): void
}
