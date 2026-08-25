import { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId } from '@porte/core/client'

/** Attach one conversation and send its current state. */
export async function attachConversation(
  sessions: Pick<SessionSupervisor, 'openConversation'>,
  catalog: ConversationCatalog,
  control: ControlNotifications,
  conversation: ConversationNotifications,
  conversationId: ConversationId,
): Promise<void> {
  const opened = await sessions.openConversation(conversationId, ({ event }) => {
    const changed = catalog.updateMetadata(conversationId, event)
    if (changed !== undefined) control.conversationUpdated(changed)
    conversation.sendEvent(event)
  })
  conversation.sendState(opened)
}
