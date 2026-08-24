import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'
import type { Result } from 'better-result'

/** Answer one pending coding-agent elicitation. */
export function answerElicitation(
  agent: Pick<CodingAgent, 'answerElicitation'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['elicitation.answer']['params'],
): Promise<Result<void, CodingAgentError>> {
  return agent.answerElicitation({ conversationId, ...command })
}
