import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** Cancel the running turn: pending answers resolve as cancelled, the agent stops the prompt. */
export const cancelTurn: CommandHandler<CommandMap['CancelTurn'], void> = async (command, deps) => {
  const conversation = deps.conversations.get(command.conversationId)
  conversation.cancelTurn(command.turnId)
  deps.conversations.save(conversation)
  await deps.codingAgent.cancel(command.conversationId)
}
