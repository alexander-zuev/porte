import type { CodingAgent, StartTurn } from '@host/application/ports/coding-agent.ts'
import type { ConversationId } from '@porte/core/client'

/** Start one turn in an open conversation. */
export function startTurn(
  codingAgent: Pick<CodingAgent, 'startTurn'>,
  conversationId: ConversationId,
  command: StartTurn,
): Promise<void> {
  return codingAgent.startTurn(conversationId, command)
}
