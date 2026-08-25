import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import type { ConversationId, HostConversationMethodMap } from '@porte/core/client'

/** Start one turn in an attached conversation. */
export function startTurn(
  sessions: Pick<SessionSupervisor, 'startTurn'>,
  conversationId: ConversationId,
  command: HostConversationMethodMap['turn.start']['params'],
): Promise<void> {
  return sessions.startTurn({ conversationId, ...command })
}
