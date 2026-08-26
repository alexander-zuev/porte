import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { ConversationId, TurnId } from '@porte/core/client'

/** Cancel the active turn in one conversation. */
export function cancelTurn(
  codingAgent: Pick<CodingAgent, 'cancelTurn'>,
  conversationId: ConversationId,
  turnId: TurnId,
): Promise<void> {
  return codingAgent.cancelTurn(conversationId, turnId)
}
