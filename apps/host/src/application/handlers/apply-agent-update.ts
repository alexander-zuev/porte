import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** Record what the agent streamed. Updates for a conversation already closed are dropped. */
export const applyAgentUpdate: CommandHandler<CommandMap['ApplyAgentUpdate'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  conversation.applyAgentEvents(command.events)
  deps.conversations.save(conversation)
}
