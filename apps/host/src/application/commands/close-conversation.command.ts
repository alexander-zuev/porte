import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ConversationId } from '@porte/core/client'
import type { Result } from 'better-result'

/** Close one coding-agent conversation. */
export function closeConversation(
  agent: Pick<CodingAgent, 'closeConversation'>,
  conversationId: ConversationId,
): Promise<Result<void, CodingAgentError>> {
  return agent.closeConversation(conversationId)
}
