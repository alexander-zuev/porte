import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** Drop one conversation from this process. Unknown ids are a no-op. */
export const closeConversation: CommandHandler<CommandMap['CloseConversation'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  // The agent settles the in-flight prompt as cancelled; FinishTurn then finds nothing to end.
  if (conversation.turn.state === 'running') await deps.codingAgent.cancel(conversation.id)
  conversation.close()
  deps.conversations.delete(conversation)
  await deps.codingAgent.closeSession(conversation.id)
}
