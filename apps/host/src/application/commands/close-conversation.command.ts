import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId } from '@porte/core/client'

/** Close one coding-agent conversation. */
export function closeConversation(
  sessions: Pick<SessionSupervisor, 'closeConversation'>,
  conversationId: ConversationId,
): Promise<void> {
  return sessions.closeConversation(conversationId)
}
