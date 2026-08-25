import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'

/** Cancel the active turn in one conversation. */
export function cancelTurn(
  sessions: Pick<SessionSupervisor, 'cancelTurn'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['turn.cancel']['params'],
): Promise<void> {
  return sessions.cancelTurn(conversationId, command.turnId)
}
