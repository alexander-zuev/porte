import { openConversationSubscription } from '@host/application/conversation-subscription.ts'
import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import { ConversationCatalog } from '@host/domain/conversation/conversation-catalog.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'
import type { Result } from 'better-result'

/** Open one conversation subscription before starting its turn. */
export async function startTurn(
  agent: Pick<CodingAgent, 'openConversation' | 'startTurn'>,
  catalog: ConversationCatalog,
  control: ControlNotifications,
  conversation: ConversationNotifications,
  conversationId: ConversationId,
  command: HostConversationMethodMap['turn.start']['params'],
): Promise<Result<void, CodingAgentError>> {
  const opened = await openConversationSubscription(
    agent,
    catalog,
    control,
    conversationId,
    conversation,
  )
  if (opened.isErr()) return opened
  return agent.startTurn({ conversationId, ...command })
}
