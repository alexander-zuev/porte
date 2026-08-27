import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

export const requestPermission: CommandHandler<CommandMap['RequestPermission'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.get(command.conversationId)
  conversation.requestPermission({
    permissionId: command.permissionId,
    toolCallId: command.toolCallId,
    title: command.title,
    options: command.options,
  })
  deps.conversations.save(conversation)
}
