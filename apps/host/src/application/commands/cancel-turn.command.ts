import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'
import type { Result } from 'better-result'

/** Cancel the active turn in one conversation. */
export function cancelTurn(
  agent: Pick<CodingAgent, 'cancelTurn'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['turn.cancel']['params'],
): Promise<Result<void, CodingAgentError>> {
  return agent.cancelTurn({ conversationId, ...command })
}
