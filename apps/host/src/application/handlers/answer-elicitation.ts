import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** The `elicitation.resolved` event releases the parked agent request (see the registry). */
export const answerElicitation: CommandHandler<CommandMap['AnswerElicitation'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.get(command.conversationId)
  conversation.answerElicitation(command.turnId, command.elicitationId, command.answer)
  deps.conversations.save(conversation)
}
