import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { ConversationId } from '@porte/core/client'

/** Close one active ACP session. Does not delete the conversation. */
export function closeConversation(
  codingAgent: Pick<CodingAgent, 'closeConversation'>,
  conversationId: ConversationId,
): Promise<void> {
  return codingAgent.closeConversation(conversationId)
}
