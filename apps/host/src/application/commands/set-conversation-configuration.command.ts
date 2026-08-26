import type { CodingAgent, SetConfiguration } from '@host/application/ports/coding-agent.ts'
import type { ConversationId } from '@porte/core/client'

/** Set one coding-agent configuration option. */
export function setConversationConfiguration(
  codingAgent: Pick<CodingAgent, 'setConfiguration'>,
  conversationId: ConversationId,
  command: SetConfiguration,
): Promise<void> {
  return codingAgent.setConfiguration(conversationId, command)
}
