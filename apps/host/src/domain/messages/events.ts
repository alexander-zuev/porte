import type { ConversationEvent, ConversationId } from '@porte/core/client'

type InConversation = { conversationId: ConversationId }

/** Payload of every host event by name. Zero or more subscribers per entry. */
export type EventDataMap = {
  /** The `Conversation` aggregate raised one canonical event for the relay and the view. */
  ConversationEventRaised: InConversation & { event: ConversationEvent }
  /** The conversation left this process; its socket and RAM can go. */
  ConversationClosed: InConversation
}
