import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** The `permission.resolved` event releases the parked agent request (see the registry). */
export const answerPermission: CommandHandler<CommandMap['AnswerPermission'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.get(command.conversationId)
  conversation.answerPermission(command.turnId, command.permissionId, command.optionId)
  deps.conversations.save(conversation)
}
