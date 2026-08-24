import { openConversationSubscription } from '@host/application/conversation-subscription.ts'
import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import { ConversationCatalog } from '@host/domain/conversation/conversation-catalog.ts'
import type { ConversationId } from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'

/** Attach one conversation and send its current state. */
export async function attachConversation(
  agent: Pick<CodingAgent, 'openConversation'>,
  catalog: ConversationCatalog,
  control: ControlNotifications,
  conversation: ConversationNotifications,
  conversationId: ConversationId,
): Promise<ResultType<void, CodingAgentError>> {
  const opened = await openConversationSubscription(
    agent,
    catalog,
    control,
    conversationId,
    conversation,
  )
  if (opened.isErr()) return opened
  conversation.sendState(opened.value)
  return Result.ok()
}
