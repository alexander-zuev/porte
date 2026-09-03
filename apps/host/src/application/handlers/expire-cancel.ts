import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'
import { AgentUnresponsiveError, createLogger } from '@porte/core/client'

const logger = createLogger('expire-cancel')

/**
 * The cancel deadline fired. A turn that ended meanwhile is a no-op; one still
 * running has an unresponsive agent, so the turn ends here as cancelled and
 * Grok's late events for it are dropped. The session stays: it is shared with
 * the terminal, and closing it would end it there too.
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
  conversation.finishTurn(command.turnId, { type: 'cancelled' })
  deps.conversations.save(conversation)
}
