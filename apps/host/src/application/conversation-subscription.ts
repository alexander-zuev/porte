import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import { ConversationCatalog } from '@host/domain/conversation/conversation-catalog.ts'
import type { ConversationId, ConversationState } from '@porte/core/client'
import type { Result } from 'better-result'

/** Open one coding-agent conversation and publish all later events. */
export function openConversationSubscription(
  agent: Pick<CodingAgent, 'openConversation'>,
  catalog: ConversationCatalog,
  control: ControlNotifications,
  conversationId: ConversationId,
  conversation: ConversationNotifications,
): Promise<Result<ConversationState, CodingAgentError>> {
  return agent.openConversation({
    conversationId,
    onEvent: ({ event }) => {
      const changed = catalog.updateMetadata(conversationId, event)
      if (changed !== undefined) control.conversationUpdated(changed)
      conversation.sendEvent(event)
    },
  })
}
