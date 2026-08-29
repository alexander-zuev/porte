import type { CommandHandler } from '@host/application/handlers/types.ts'
import { IDLE_EVICTION_MS } from '@host/application/turn-policy.ts'
import { createCommand, type CommandMap } from '@host/domain/messages/types.ts'
import { IsoDateTimeSchema } from '@porte/core/client'

/** End a turn and start the idle clock. A conversation closed meanwhile has nothing to end. */
export const finishTurn: CommandHandler<CommandMap['FinishTurn'], void> = async (command, deps) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  if (command.usage !== undefined) {
    conversation.applyAgentEvents([{ type: 'conversation.usage.updated', usage: command.usage }])
  }
  conversation.finishTurn(command.turnId, command.outcome)
  conversation.touch(IsoDateTimeSchema.parse(deps.now().toISOString()))
  deps.conversations.save(conversation)

  const { conversationId } = command
  deps.scheduler.schedule(IDLE_EVICTION_MS, () => {
    deps.background.run(deps.bus.handle(createCommand('CloseIdleConversation', { conversationId })))
  })
}
