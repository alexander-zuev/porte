import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** End a turn. A conversation closed meanwhile has nothing to end. */
export const finishTurn: CommandHandler<CommandMap['FinishTurn'], void> = async (command, deps) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  if (command.usage !== undefined) {
    conversation.applyAgentEvents([{ type: 'conversation.usage.updated', usage: command.usage }])
  }
  conversation.finishTurn(command.turnId, command.outcome)
  deps.conversations.save(conversation)
}
