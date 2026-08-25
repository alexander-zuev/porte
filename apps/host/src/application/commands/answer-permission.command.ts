import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'

/** Answer one pending coding-agent permission request. */
export function answerPermission(
  sessions: Pick<SessionSupervisor, 'getSession'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['permission.answer']['params'],
): Promise<void> {
  return sessions.getSession(conversationId).answerPermission({ conversationId, ...command })
}
