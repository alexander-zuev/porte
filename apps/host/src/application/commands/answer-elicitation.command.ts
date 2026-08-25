import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'

/** Answer one pending coding-agent elicitation. */
export function answerElicitation(
  sessions: Pick<SessionSupervisor, 'getSession'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['elicitation.answer']['params'],
): Promise<void> {
  return sessions.getSession(conversationId).answerElicitation({ conversationId, ...command })
}
