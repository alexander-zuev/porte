import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationSummary, HostControlMethodMap } from '@porte/core/client'

/** Create one coding-agent conversation. */
export async function createConversation(
  sessions: Pick<SessionSupervisor, 'createConversation'>,
  command: HostControlMethodMap['conversation.create']['params'],
): Promise<ConversationSummary> {
  return sessions.createConversation(command.cwd)
}
