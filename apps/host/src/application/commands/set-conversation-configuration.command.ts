import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'

/** Set one coding-agent configuration option. */
export function setConversationConfiguration(
  sessions: Pick<SessionSupervisor, 'getSession'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['conversation.configuration.set']['params'],
): Promise<void> {
  return sessions.getSession(conversationId).setConfiguration({ conversationId, ...command })
}
