import type { EventHandler } from '@host/application/handlers/types.ts'
import type { EventMap } from '@host/domain/messages/types.ts'

/** Effect: a closed conversation needs no relay socket. */
export const dropConversationSocket: EventHandler<EventMap['ConversationClosed']> = async (
  event,
  deps,
) => {
  deps.connections.closeConversation(event.conversationId)
}
