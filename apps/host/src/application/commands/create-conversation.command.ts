import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { ConversationSummary, HostControlMethodMap } from '@porte/core/client'

/** Create one coding-agent conversation. */
export function createConversation(
  codingAgent: Pick<CodingAgent, 'createConversation'>,
  command: HostControlMethodMap['conversation.create']['params'],
): Promise<ConversationSummary> {
  return codingAgent.createConversation(command.cwd)
}
