import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import type { ConversationId } from '@porte/core/client'

/** Restore one existing conversation onto this process and load its history. */
export async function openConversation(
  codingAgent: Pick<CodingAgent, 'has' | 'findSession' | 'hold' | 'loadSession' | 'drop'>,
  conversationId: ConversationId,
): Promise<void> {
  if (codingAgent.has(conversationId)) return

  const facts = await codingAgent.findSession(conversationId)
  const conversation = Conversation.restore(facts)
  codingAgent.hold(conversation)
  try {
    await codingAgent.loadSession(conversation)
  } catch (cause) {
    codingAgent.drop(conversation.id)
    throw cause
  }
}
