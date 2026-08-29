import type { CommandHandler } from '@host/application/handlers/types.ts'
import { IDLE_EVICTION_MS } from '@host/application/turn-policy.ts'
import { createCommand, type CommandMap } from '@host/domain/messages/types.ts'

/**
 * Bound the Host's memory: close a conversation whose last turn ended a full
 * idle window ago. A running turn or fresh activity is a no-op; the timer that
 * follows the next `FinishTurn` will look again. A returning viewer re-attaches
 * and the session reloads.
 */
export const closeIdleConversation: CommandHandler<
  CommandMap['CloseIdleConversation'],
  void
> = async (command, deps) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  if (conversation.turn.state === 'running') return
  const idleMs = deps.now().getTime() - Date.parse(conversation.lastActivityAt)
  if (idleMs < IDLE_EVICTION_MS) return
  await deps.bus.handle(
    createCommand('CloseConversation', { conversationId: command.conversationId }),
  )
}
