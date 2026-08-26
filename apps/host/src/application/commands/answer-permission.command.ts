import type { AnswerPermission, CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { ConversationId } from '@porte/core/client'

/** Answer one pending coding-agent permission request. */
export function answerPermission(
  codingAgent: Pick<CodingAgent, 'answerPermission'>,
  conversationId: ConversationId,
  command: AnswerPermission,
): Promise<void> {
  return codingAgent.answerPermission(conversationId, command)
}
