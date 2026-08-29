import type { CommandHandler } from '@host/application/handlers/types.ts'
import { createCommand, type CommandMap } from '@host/domain/messages/types.ts'
import { AgentUnresponsiveError, createLogger } from '@porte/core/client'

const logger = createLogger('expire-cancel')

/**
 * The cancel deadline fired. A prompt that settled meanwhile is a no-op; one
 * still running has an unresponsive agent: close its session so the mapper and
 * process state go with it, then finish the turn as cancelled. The next turn
 * reloads the session.
 */
export const expireCancel: CommandHandler<CommandMap['ExpireCancel'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  const turn = conversation.turn
  if (turn.state !== 'running' || turn.turnId !== command.turnId) return

  logger.warn('cancel_deadline_expired', {
    error: new AgentUnresponsiveError(),
    details: { conversationId: command.conversationId, turnId: command.turnId },
  })
  await deps.codingAgent.closeSession(command.conversationId)
  await deps.bus.handle(
    createCommand('FinishTurn', {
      conversationId: command.conversationId,
      turnId: command.turnId,
      outcome: { type: 'cancelled' },
    }),
  )
}
