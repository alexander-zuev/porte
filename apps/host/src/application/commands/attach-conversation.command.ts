import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId } from '@porte/core/client'

/** Attach one conversation and send its current state. */
export async function attachConversation(
  sessions: Pick<SessionSupervisor, 'openConversation'>,
  control: ControlNotifications,
  conversation: ConversationNotifications,
  conversationId: ConversationId,
): Promise<void> {
  const session = await sessions.openConversation(conversationId)
  session.setListener(({ event }) => {
    if (event.type === 'conversation.metadata.updated') {
      control.conversationUpdated(conversationId, event.update)
    }
    conversation.sendEvent(event)
  })
  conversation.sendState(session.state)
}
