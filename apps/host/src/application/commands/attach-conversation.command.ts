import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import type { ConversationId } from '@porte/core/client'

/** Open one ACP session and subscribe to its events. */
export async function attachConversation(
  codingAgent: Pick<CodingAgent, 'openConversation' | 'onEvent'>,
  control: ControlNotifications,
  conversation: ConversationNotifications,
  conversationId: ConversationId,
): Promise<void> {
  await codingAgent.openConversation(conversationId)
  codingAgent.onEvent(conversationId, (event) => {
    if (event.type === 'conversation.metadata.updated') {
      control.conversationUpdated(conversationId, event.update)
    }
    conversation.sendEvent(event)
  })
}
