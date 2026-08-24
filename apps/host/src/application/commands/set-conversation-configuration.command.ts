import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'
import type { Result } from 'better-result'

/** Set one coding-agent configuration option. */
export function setConversationConfiguration(
  agent: Pick<CodingAgent, 'setConfiguration'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['conversation.configuration.set']['params'],
): Promise<Result<void, CodingAgentError>> {
  return agent.setConfiguration({ conversationId, ...command })
}
