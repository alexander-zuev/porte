import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

export const requestElicitation: CommandHandler<CommandMap['RequestElicitation'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.get(command.conversationId)
  conversation.requestElicitation({
    elicitationId: command.elicitationId,
    request: command.request,
  })
  deps.conversations.save(conversation)
}
