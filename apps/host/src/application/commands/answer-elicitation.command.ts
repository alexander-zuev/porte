import type { AnswerElicitation, CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { ConversationId } from '@porte/core/client'

/** Answer one pending coding-agent elicitation. */
export function answerElicitation(
  codingAgent: Pick<CodingAgent, 'answerElicitation'>,
  conversationId: ConversationId,
  command: AnswerElicitation,
): Promise<void> {
  return codingAgent.answerElicitation(conversationId, command)
}
