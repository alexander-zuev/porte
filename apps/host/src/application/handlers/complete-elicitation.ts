import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

export const completeElicitation: CommandHandler<CommandMap['CompleteElicitation'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.get(command.conversationId)
  conversation.completeElicitation(command.elicitationId)
  deps.conversations.save(conversation)
}
