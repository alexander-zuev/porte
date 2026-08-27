import type { EventHandler } from '@host/application/handlers/types.ts'
import type { EventMap } from '@host/domain/messages/types.ts'

/** Effect: forward the canonical event to the relay; metadata also goes to the control socket. */
export const publishConversationEvent: EventHandler<EventMap['ConversationEventRaised']> = async (
  raised,
  deps,
) => {
  if (raised.event.type === 'conversation.metadata.updated') {
    deps.connections.control.conversationUpdated(raised.conversationId, raised.event.update)
  }
  deps.connections.conversation(raised.conversationId)?.sendEvent(raised.event)
}
