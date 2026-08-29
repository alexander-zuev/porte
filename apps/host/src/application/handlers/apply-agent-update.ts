import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'
import { createLogger } from '@porte/core/client'

const logger = createLogger('apply-agent-update')

/**
 * Record what the agent streamed. Updates for a conversation already closed are
 * dropped, and so are turn-scoped events for a turn that is not running: after
 * a cancel deadline the agent may keep talking about a turn the Host finished.
 */
export const applyAgentUpdate: CommandHandler<CommandMap['ApplyAgentUpdate'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  const turn = conversation.turn
  const events = command.events.filter((event) => {
    if (!('turnId' in event)) return true
    return turn.state === 'running' && turn.turnId === event.turnId
  })
  if (events.length < command.events.length) {
    logger.debug('late_agent_events_dropped', {
      details: {
        conversationId: command.conversationId,
        dropped: command.events.length - events.length,
      },
    })
  }
  if (events.length === 0) return
  conversation.applyAgentEvents(events)
  deps.conversations.save(conversation)
}
