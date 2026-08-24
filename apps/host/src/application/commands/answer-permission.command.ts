import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'
import type { Result } from 'better-result'

/** Answer one pending coding-agent permission request. */
export function answerPermission(
  agent: Pick<CodingAgent, 'answerPermission'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['permission.answer']['params'],
): Promise<Result<void, CodingAgentError>> {
  return agent.answerPermission({ conversationId, ...command })
}
